import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

const VALID_STATUSES = ["pending", "upheld", "dismissed", "overturned", "paid", "labor"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const service = createServiceClient();

  const dateResolved = ["paid", "dismissed", "labor"].includes(status)
    ? new Date().toISOString().split("T")[0]
    : null;

  const { data: fine } = await service
    .from("fines")
    .select("fine_type, description, amount, member_id, members(name)")
    .eq("id", id)
    .single();

  const { error } = await service
    .from("fines")
    .update({ status, date_resolved: dateResolved })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (fine) {
    const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Updated Fine Status",
      details: `${memberName} — ${fine.fine_type} changed to "${status}"`,
    });

    if (status === "paid") {
      try {
        const baseUrl = req.nextUrl.origin;
        await fetch(`${baseUrl}/api/admin/export-fine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            member_name: memberName,
            fine_type: fine.fine_type,
            description: fine.description,
            amount: fine.amount,
            date_resolved: dateResolved,
          }),
        });
      } catch {
        // Export failure should not fail the status update
      }
    }
  }

  return NextResponse.json({ success: true });
}
