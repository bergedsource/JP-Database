import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const PENALTY_MULTIPLIER = 1.4;
const SOC_PRO_REASON = "Outstanding Fines (§10-270)";

// Labor not completed: fine goes back to outstanding (upheld) at 1.4x, and the member is put on soc pro.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: fine } = await service
    .from("fines")
    .select("fine_type, status, amount, labor_completed_at, member_id, members(name)")
    .eq("id", id)
    .single();

  if (!fine) return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  if (fine.status !== "labor" || fine.labor_completed_at) {
    return NextResponse.json({ error: "Fine is not on the labor list" }, { status: 409 });
  }
  if (fine.amount == null) {
    return NextResponse.json({ error: "Fine has no amount to increase — set an amount first" }, { status: 400 });
  }

  const newAmount = Math.round(fine.amount * PENALTY_MULTIPLIER * 100) / 100;
  const { error } = await service
    .from("fines")
    .update({ status: "upheld", amount: newAmount, date_resolved: null, labor_completed_at: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
  const table = current.role === "root" ? "system_events" : "audit_logs";

  // Skip soc pro if the member is already on it for outstanding fines
  const { data: existingSP } = await service
    .from("social_probation")
    .select("id")
    .eq("member_id", fine.member_id)
    .eq("reason", SOC_PRO_REASON)
    .is("end_date", null)
    .limit(1);

  const today = new Date().toISOString().split("T")[0];
  if (!existingSP?.length) {
    await service.from("social_probation").insert({
      member_id: fine.member_id,
      reason: SOC_PRO_REASON,
      start_date: today,
      source: "manual",
      notes: `Labor not completed — ${fine.fine_type}`,
    });
    await service.from(table).insert({
      admin_email: current.email,
      action: "Added Social Probation",
      details: `${memberName} — ${SOC_PRO_REASON} (labor not completed)`,
    });
  }

  await service.from(table).insert({
    admin_email: current.email,
    action: "Labor Not Completed",
    details: `${memberName} — ${fine.fine_type}: labor not completed, fine raised $${fine.amount.toFixed(2)} → $${newAmount.toFixed(2)} and moved to outstanding`,
  });

  return NextResponse.json({ success: true, amount: newAmount });
}
