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

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const auditTable = current.role === "root" ? "system_events" : "audit_logs";

  // Missed his turn: any fine from this session still undecided at close is upheld
  // (only those fines, so an officer he did show up for isn't affected), and he is
  // recorded absent for the week. Both happen BEFORE the session is marked closed,
  // so if either write fails the session stays open and the chair can retry.
  const { data: sessionFines, error: sfError } = await service
    .from("jp_session_fines")
    .select("fine_id, fines(member_id, status, fine_type)")
    .eq("session_id", id);
  if (sfError) return NextResponse.json({ error: "Couldn't read this session's fines. Nothing was changed; try again." }, { status: 500 });
  const missed = ((sessionFines ?? []) as unknown as { fine_id: string; fines: { member_id: string; status: string; fine_type: string } | null }[])
    .filter((r) => r.fines?.status === "pending")
    .map((r) => ({ fineId: r.fine_id, memberId: r.fines!.member_id, fineType: r.fines!.fine_type }));
  const absentIds = [...new Set(missed.map((m) => m.memberId))];

  if (absentIds.length > 0) {
    const { error: absError } = await service
      .from("jp_absences")
      .upsert(absentIds.map((member_id) => ({ session_id: id, session_date: session.date_held, member_id })), { onConflict: "session_id,member_id", ignoreDuplicates: true });
    if (absError) {
      return NextResponse.json({ error: `Couldn't record no-shows (${absError.message}). The session is still open; try closing again.` }, { status: 500 });
    }
    const { error: upError } = await service
      .from("fines")
      .update({ status: "upheld", date_resolved: null, labor_completed_at: null })
      .in("id", missed.map((m) => m.fineId))
      .eq("status", "pending");
    if (upError) {
      return NextResponse.json({ error: `Couldn't uphold the missed fines (${upError.message}). The session is still open; try closing again.` }, { status: 500 });
    }
  }

  const { error } = await service
    .from("jp_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (absentIds.length > 0) {
    const { data: names } = await service.from("members").select("id, name").in("id", absentIds);
    const nameOf = new Map((names ?? []).map((n) => [n.id as string, n.name as string]));
    await service.from(auditTable).insert([
      {
        admin_email: current.email,
        action: "JP No-shows Recorded",
        details: `${session.date_held}: ${absentIds.map((m) => nameOf.get(m) ?? "Unknown").join(", ")}`,
      },
      {
        admin_email: current.email,
        action: "Missed Fines Upheld at Close",
        details: `${session.date_held}: ${missed.map((m) => `${nameOf.get(m.memberId) ?? "Unknown"} — ${m.fineType}`).join("; ")}`,
      },
    ]);
  }

  // Learn how long tonight's hearings really took, so future wait estimates improve.
  try {
    await learnFromSession(service, id);
  } catch {}

  if (missed.length > 0) {
    await service.from("jp_session_changes").insert(
      missed.map((m) => ({
        session_id: id,
        fine_id: m.fineId,
        changed_by_user_id: current.userId,
        changed_by_email: `${current.email} (missed, upheld at close)`,
        old_status: "pending",
        new_status: "upheld",
      }))
    );
  }

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
