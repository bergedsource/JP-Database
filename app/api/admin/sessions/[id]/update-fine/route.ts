import { getCurrentRole } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/sessions/[id]/update-fine — update a fine's status and/or amount, log the change
//
// Accepts { fine_id, new_status? , amount? }. At least one of new_status/amount must be
// present. `amount: null` is meaningful (clears the amount), so presence is detected with
// the `in` operator rather than a truthiness check.
//
// Both edits are only allowed while the session is OPEN: a closed session is the ratified
// record of what was decided, so it must not shift afterwards. The UI disables these
// controls on a closed session, but that was previously the only thing enforcing it —
// the API accepted the write regardless.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Destructive write — rate-limit like the other admin mutation routes.
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const current = await getCurrentRole();
  if (!current || (current.role !== "owner" && current.role !== "root")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: session_id } = await params;
  const body = await req.json();
  const { fine_id, new_status } = body;
  const hasStatus = new_status != null;
  const hasAmount = Object.prototype.hasOwnProperty.call(body, "amount");

  if (!fine_id || (!hasStatus && !hasAmount)) {
    return NextResponse.json(
      { error: "fine_id and at least one of new_status or amount are required" },
      { status: 400 }
    );
  }

  const VALID_STATUSES = ["pending", "upheld", "dismissed", "paid", "labor", "overturned", "added_to_dues"];
  if (hasStatus && !VALID_STATUSES.includes(new_status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Same bounds and rounding as /api/admin/fines/[id]/amount so an amount edited here
  // can't differ in shape from one edited on the Fines tab.
  let newAmount: number | null = null;
  if (hasAmount && body.amount != null && body.amount !== "") {
    const parsed = parseFloat(body.amount);
    if (!isFinite(parsed) || parsed < 0 || parsed > 10000) {
      return NextResponse.json({ error: "Amount must be between $0 and $10,000" }, { status: 400 });
    }
    newAmount = Math.round(parsed * 100) / 100;
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

  // A closed session is a settled record — reject edits to it.
  const { data: session } = await service
    .from("jp_sessions")
    .select("closed_at")
    .eq("id", session_id)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at !== null) {
    return NextResponse.json({ error: "This session is closed and can no longer be edited." }, { status: 409 });
  }

  // Current values, for the change log and audit trail
  const { data: fine } = await service
    .from("fines")
    .select("status, amount, fine_type, members(name)")
    .eq("id", fine_id)
    .single();

  if (!fine) return NextResponse.json({ error: "Fine not found" }, { status: 404 });

  const old_status = fine.status;
  const old_amount: number | null = fine.amount;
  const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";

  const updates: { status?: string; amount?: number | null } = {};
  if (hasStatus) updates.status = new_status;
  if (hasAmount) updates.amount = newAmount;

  const { error: updateError } = await service
    .from("fines")
    .update(updates)
    .eq("id", fine_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";

  // jp_session_changes is status-shaped (old_status/new_status), so only a status edit
  // goes there. Amount edits are recorded in the audit trail instead.
  if (hasStatus) {
    const { error: changeError } = await service.from("jp_session_changes").insert({
      session_id,
      fine_id,
      changed_by_user_id: current.userId,
      changed_by_email: current.email,
      old_status,
      new_status,
    });
    if (changeError) return NextResponse.json({ error: changeError.message }, { status: 500 });

    await service.from(auditTable).insert({
      admin_email: current.email,
      action: "Fine Status Updated (JP Session)",
      details: `Fine ${fine_id} changed from ${old_status} to ${new_status} during session ${session_id}`,
    });
  }

  if (hasAmount) {
    const fmt = (v: number | null) => (v != null ? `$${v.toFixed(2)}` : "none");
    await service.from(auditTable).insert({
      admin_email: current.email,
      action: "Adjusted Fine Amount (JP Session)",
      details: `${memberName} — ${fine.fine_type}: amount changed from ${fmt(old_amount)} to ${fmt(newAmount)} during session ${session_id}`,
    });
  }

  return NextResponse.json({
    success: true,
    ...(hasStatus ? { old_status, new_status } : {}),
    ...(hasAmount ? { old_amount, amount: newAmount } : {}),
  });
}
