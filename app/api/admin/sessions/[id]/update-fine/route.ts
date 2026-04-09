import { getCurrentRole } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/sessions/[id]/update-fine — update a fine's status, log the change
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const current = await getCurrentRole();
  if (!current || (current.role !== "owner" && current.role !== "root")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: session_id } = await params;
  const { fine_id, new_status } = await req.json();

  if (!fine_id || !new_status) {
    return NextResponse.json({ error: "fine_id and new_status are required" }, { status: 400 });
  }

  const VALID_STATUSES = ["pending", "upheld", "dismissed", "paid", "labor", "overturned"];
  if (!VALID_STATUSES.includes(new_status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify this fine is part of this session
  const { data: sessionFine } = await service
    .from("jp_session_fines")
    .select("fine_id")
    .eq("session_id", session_id)
    .eq("fine_id", fine_id)
    .single();

  if (!sessionFine) {
    return NextResponse.json({ error: "Fine not in this session" }, { status: 404 });
  }

  // Get current fine status
  const { data: fine } = await service
    .from("fines")
    .select("status")
    .eq("id", fine_id)
    .single();

  if (!fine) return NextResponse.json({ error: "Fine not found" }, { status: 404 });

  const old_status = fine.status;

  // Update the fine status
  const { error: updateError } = await service
    .from("fines")
    .update({ status: new_status })
    .eq("id", fine_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Log to jp_session_changes
  const { error: changeError } = await service.from("jp_session_changes").insert({
    session_id,
    fine_id,
    changed_by_user_id: current.userId,
    changed_by_email: current.email,
    old_status,
    new_status,
  });
  if (changeError) return NextResponse.json({ error: changeError.message }, { status: 500 });

  // Log to the appropriate audit table based on role
  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Fine Status Updated (JP Session)",
    details: `Fine ${fine_id} changed from ${old_status} to ${new_status} during session ${session_id}`,
  });

  return NextResponse.json({ success: true, old_status, new_status });
}
