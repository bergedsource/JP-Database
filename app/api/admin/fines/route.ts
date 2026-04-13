import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { members, fine_type, description, amount, term, date_issued, notes, fining_officer } = await req.json();

  if (!Array.isArray(members) || members.length === 0) {
    return NextResponse.json({ error: "At least one member is required" }, { status: 400 });
  }
  if (!fine_type || !description || !term || !date_issued) {
    return NextResponse.json({ error: "fine_type, description, term, and date_issued are required" }, { status: 400 });
  }

  const service = createServiceClient();

  let parsedAmount: number | null = null;
  if (amount != null && amount !== "") {
    const n = parseFloat(amount);
    if (!isFinite(n) || n < 0 || n > 10000) {
      return NextResponse.json({ error: "Amount must be between $0 and $10,000" }, { status: 400 });
    }
    parsedAmount = Math.round(n * 100) / 100;
  }

  const rows = members.map((m: { id: string; name: string }) => ({
    member_id: m.id,
    fine_type,
    description,
    amount: parsedAmount,
    status: "pending",
    term,
    date_issued,
    notes: notes || null,
    fining_officer: fining_officer || null,
    created_by_user_id: current.userId,
  }));

  const { error } = await service.from("fines").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const names = members.map((m: { id: string; name: string }) => m.name).join(", ");
  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Issued Fine",
    details: `${fine_type} against ${names} — "${description}" (${term}${amount ? `, $${amount}` : ""})`,
  });

  return NextResponse.json({ success: true, count: rows.length });
}
