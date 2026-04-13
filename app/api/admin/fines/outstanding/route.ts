import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { member_id, member_name, fine_type, description, amount, term, date_issued, notes, place_on_soc_pro } = await req.json();

  if (!member_id || !fine_type || !description || !term || !date_issued) {
    return NextResponse.json({ error: "member_id, fine_type, description, term, and date_issued are required" }, { status: 400 });
  }

  let parsedAmount: number | null = null;
  if (amount != null && amount !== "") {
    const n = parseFloat(amount);
    if (!isFinite(n) || n < 0 || n > 10000) {
      return NextResponse.json({ error: "Amount must be between $0 and $10,000" }, { status: 400 });
    }
    parsedAmount = Math.round(n * 100) / 100;
  }

  const service = createServiceClient();

  const { error } = await service.from("fines").insert({
    member_id,
    fine_type,
    description,
    amount: parsedAmount,
    status: "upheld",
    term,
    date_issued,
    notes: notes || null,
    created_by_user_id: current.userId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from("audit_logs").insert({
    admin_email: current.email,
    action: "Issued Outstanding Fine",
    details: `${member_name ?? "Unknown"} — ${fine_type}${amount ? ` $${amount}` : ""} (${term})`,
  });

  if (place_on_soc_pro) {
    const today = new Date().toISOString().split("T")[0];
    await service.from("social_probation").insert({
      member_id,
      reason: "Outstanding Fines (§10-270)",
      start_date: today,
      source: "manual",
      notes: notes || null,
    });
    await service.from("audit_logs").insert({
      admin_email: current.email,
      action: "Added Social Probation",
      details: `${member_name ?? "Unknown"} — Outstanding Fines (§10-270) (manual, issued with fine)`,
    });
  }

  return NextResponse.json({ success: true });
}
