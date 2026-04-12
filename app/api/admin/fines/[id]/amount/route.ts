import { getCurrentRole } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { amount } = await req.json();
  const newAmount = amount != null && amount !== "" ? parseFloat(amount) : null;

  const service = createServiceClient();

  if (current.role !== "owner" && current.role !== "root") {
    const { data: fine } = await service
      .from("fines")
      .select("created_by_user_id")
      .eq("id", id)
      .single();

    if (!fine || fine.created_by_user_id !== current.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: fine } = await service
    .from("fines")
    .select("fine_type, member_id, members(name)")
    .eq("id", id)
    .single();

  const { error } = await service.from("fines").update({ amount: newAmount }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (fine) {
    const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Adjusted Fine Amount",
      details: `${memberName} — ${fine.fine_type}: amount changed to ${newAmount != null ? `$${newAmount.toFixed(2)}` : "none"}`,
    });
  }

  return NextResponse.json({ success: true });
}
