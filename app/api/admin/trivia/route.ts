import { getCurrentRole, requireAuth, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const MAX_TEXT_LEN = 200;

export async function GET(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("chapter_trivia")
    .select("id, question_text, option_a, option_b, option_c, option_d, correct_index, created_at, created_by")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const fields = ["question_text", "option_a", "option_b", "option_c", "option_d"] as const;
  const text: Record<string, string> = {};
  for (const f of fields) {
    const v = typeof body[f] === "string" ? body[f].trim() : "";
    if (!v) return NextResponse.json({ error: `Missing or empty: ${f}` }, { status: 400 });
    if (v.length > MAX_TEXT_LEN) return NextResponse.json({ error: `${f} too long (max ${MAX_TEXT_LEN})` }, { status: 400 });
    text[f] = v;
  }

  const correct_index = body.correct_index;
  if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index > 3) {
    return NextResponse.json({ error: "correct_index must be an integer 0-3" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: inserted, error } = await service
    .from("chapter_trivia")
    .insert({ ...text, correct_index, created_by: current.email })
    .select("id, question_text, option_a, option_b, option_c, option_d, correct_index, created_at, created_by")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Created Trivia Question",
    details: `"${text.question_text.slice(0, 80)}"`,
  });

  return NextResponse.json(inserted);
}
