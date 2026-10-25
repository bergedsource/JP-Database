import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { learnFromSession } from "@/lib/jp-docket";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/sessions/[id]/close — mark a session as closed
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const service = createServiceClient();

  const { data: session } = await service
    .from("jp_sessions")
    .select("closed_at, date_held")
    .eq("id", id)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at !== null) return NextResponse.json({ success: true }); // already closed

  const { error } = await service
    .from("jp_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Anyone whose fine from this session is still undecided didn't get heard: record
  // him absent for this week. The fine itself stays pending for next session.
  const { data: sessionFines } = await service
    .from("jp_session_fines")
    .select("fine_id, fines(member_id, status)")
    .eq("session_id", id);
  const absentIds = [
    ...new Set(
      ((sessionFines ?? []) as unknown as { fines: { member_id: string; status: string } | null }[])
        .filter((r) => r.fines?.status === "pending")
        .map((r) => r.fines!.member_id)
    ),
  ];
  if (absentIds.length > 0) {
    await service
      .from("jp_absences")
      .upsert(absentIds.map((member_id) => ({ session_id: id, session_date: session.date_held, member_id })), { onConflict: "session_id,member_id", ignoreDuplicates: true });
    const current = await getCurrentRole();
    if (current) {
      const { data: names } = await service.from("members").select("name").in("id", absentIds);
      await service.from(current.role === "root" ? "system_events" : "audit_logs").insert({
        admin_email: current.email,
        action: "JP No-shows Recorded",
        details: `${session.date_held}: ${(names ?? []).map((n) => n.name).join(", ")}`,
      });
    }
  }

  // Learn how long tonight's hearings really took, so future wait estimates improve.
  try {
    await learnFromSession(service, id);
  } catch {}

  // The night is over: drop every phone number and ticket link taken for it, and
  // close the tickets that were still open.
  await service
    .from("jp_tickets")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("session_date", session.date_held)
    .neq("status", "cancelled");
  await service
    .from("jp_tickets")
    .update({ phone: null, snapchat: null, token_hash: null, proxy_name: null })
    .eq("session_date", session.date_held);

  return NextResponse.json({ success: true });
}
