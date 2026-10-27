import { getCurrentRole, requireAuth } from "@/lib/admin-auth";
import type { JpSessionFine, JpSessionChange } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { officerRank } from "@/lib/jp-info";

// Shapes of the joined rows the selects below return.
//
// These need an `as unknown as` cast at the call site: with no generated DB
// types, Supabase infers embedded relations as arrays, but PostgREST returns a
// single object for a many-to-one embed (the FK lives on the source table).
// Same override the rest of the codebase already uses — see the
// `as unknown as { members?: { name: string } }` casts in fines/[id]/route.ts,
// fines/[id]/status, fines/[id]/amount, and social-probation/[id].
// Fields stay nullable because a join can come back empty.
type SessionFineRow = {
  session_id: string;
  fine_id: string;
  snapshot_status: string;
  fines: {
    member_id: string | null;
    fine_type: string | null;
    description: string | null;
    amount: number | null;
    status: string | null;
    term: string | null;
    date_issued: string | null;
    fining_officer: string | null;
    notes: string | null;
    created_by_user_id: string | null;
    members: { name: string | null } | null;
  } | null;
};

type SessionChangeRow = {
  id: string;
  session_id: string;
  fine_id: string;
  changed_by_user_id: string;
  changed_by_email: string;
  old_status: string;
  new_status: string;
  changed_at: string;
  fines: {
    fine_type: string | null;
    members: { name: string | null } | null;
  } | null;
};

// GET /api/admin/sessions/[id] — session detail: fines + change log
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;
  // Private fine notes are for owners/root only, never view-only admins.
  const current = await getCurrentRole();
  const canSeeNotes = current?.role === "owner" || current?.role === "root";

  const { id } = await params;
  const service = createServiceClient();

  // Get session
  const { data: session, error: sessionError } = await service
    .from("jp_sessions")
    .select("id, date_held, closed_at, created_at")
    .eq("id", id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get fines in this session, joined with member name and fine fields
  const { data: sessionFines, error: finesError } = await service
    .from("jp_session_fines")
    .select(`
      session_id,
      fine_id,
      snapshot_status,
      fines (
        member_id,
        fine_type,
        description,
        amount,
        status,
        term,
        date_issued,
        fining_officer,
        notes,
        created_by_user_id,
        members ( name )
      )
    `)
    .eq("session_id", id);

  if (finesError) {
    return NextResponse.json({ error: finesError.message }, { status: 500 });
  }

  // Flatten the joined data
  // The session list only shows fines still in play: pending, upheld or overturned.
  // Dismissed, labor, paid and added-to-dues fines drop off (the change log keeps the history).
  const SHOWN = new Set(["pending", "upheld", "overturned"]);
  const fineRows = ((sessionFines ?? []) as unknown as SessionFineRow[]).filter((row) => SHOWN.has(row.fines?.status ?? ""));
  const fines: JpSessionFine[] = fineRows.map((row) => ({
    session_id: row.session_id,
    fine_id: row.fine_id,
    snapshot_status: row.snapshot_status,
    fine_type: row.fines?.fine_type ?? "",
    description: row.fines?.description ?? "",
    amount: row.fines?.amount ?? null,
    status: row.fines?.status ?? "",
    term: row.fines?.term ?? "",
    date_issued: row.fines?.date_issued ?? "",
    fining_officer: row.fines?.fining_officer ?? null,
    notes: canSeeNotes ? row.fines?.notes ?? null : null,
    created_by_user_id: row.fines?.created_by_user_id ?? null,
    member_id: row.fines?.member_id ?? "",
    member_name: row.fines?.members?.name ?? "",
  }));

  // Get change log for this session
  const { data: changes } = await service
    .from("jp_session_changes")
    .select(`
      id,
      session_id,
      fine_id,
      changed_by_user_id,
      changed_by_email,
      old_status,
      new_status,
      changed_at,
      fines ( fine_type, members ( name ) )
    `)
    .eq("session_id", id)
    .order("changed_at", { ascending: true });

  const changeRows = (changes ?? []) as unknown as SessionChangeRow[];
  const changeLog: JpSessionChange[] = changeRows.map((c) => ({
    id: c.id,
    session_id: c.session_id,
    fine_id: c.fine_id,
    changed_by_user_id: c.changed_by_user_id,
    changed_by_email: c.changed_by_email,
    old_status: c.old_status,
    new_status: c.new_status,
    changed_at: c.changed_at,
    member_name: c.fines?.members?.name ?? "",
    fine_type: c.fines?.fine_type ?? "",
  }));

  // Brothers recorded absent when this session closed (undecided fines).
  const { data: absenceRows } = await service
    .from("jp_absences")
    .select("member_id, members ( name )")
    .eq("session_id", id);
  const absences = ((absenceRows ?? []) as unknown as { member_id: string; members: { name: string | null } | null }[])
    .map((a) => ({ member_id: a.member_id, member_name: a.members?.name ?? "Unknown" }))
    .sort((a, b) => a.member_name.localeCompare(b.member_name));

  // Fixed officer order for this session (from every fine it started with, so it
  // doesn't shift as fines are decided or drop off the list).
  const officer_order = officerRank(
    ((sessionFines ?? []) as unknown as SessionFineRow[]).flatMap((r) => (r.fines?.member_id ? [{ member_id: r.fines.member_id, fining_officer: r.fines.fining_officer }] : []))
  );

  // Who has a ticket for which officer tonight (no contact details here).
  const { data: ticketRows } = await service
    .from("jp_tickets")
    .select("member_id, fining_officer, ticket_no, status")
    .eq("session_date", session.date_held)
    .not("fining_officer", "is", null)
    .neq("status", "cancelled");
  const tickets = (ticketRows ?? []).map((t) => ({
    member_id: t.member_id as string,
    officer: (t.fining_officer as string).trim(),
    no: (t.ticket_no as number | null) ?? null,
    status: t.status as string,
  }));

  return NextResponse.json({ session, fines, changes: changeLog, absences, officer_order, tickets });
}
