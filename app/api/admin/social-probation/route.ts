import { getCurrentRole, requireAuth, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("social_probation")
    .select("*, members(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { member_id, member_name, reason, notes, start_date, end_date } = await req.json();

  if (!member_id || !reason || !start_date) {
    return NextResponse.json({ error: "member_id, reason, and start_date are required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { error } = await service.from("social_probation").insert({
    member_id,
    reason,
    notes: notes || null,
    start_date,
    end_date: end_date || null,
    source: "manual",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from("audit_logs").insert({
    admin_email: current.email,
    action: "Added Social Probation",
    details: `${member_name ?? "Unknown"} — ${reason}`,
  });

  return NextResponse.json({ success: true });
}
