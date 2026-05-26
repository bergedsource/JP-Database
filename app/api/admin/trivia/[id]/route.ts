import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const triviaId = parseInt(id, 10);
  if (!Number.isInteger(triviaId) || triviaId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: entry } = await service
    .from("chapter_trivia")
    .select("question_text")
    .eq("id", triviaId)
    .maybeSingle();
  if (!entry) return NextResponse.json({ error: "Trivia not found" }, { status: 404 });

  const { error } = await service.from("chapter_trivia").delete().eq("id", triviaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Deleted Trivia Question",
    details: `"${entry.question_text.slice(0, 80)}"`,
  });

  return NextResponse.json({ success: true });
}
