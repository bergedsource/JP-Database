import { requireAuth } from "@/lib/admin-auth";
import type { JpSessionFine, JpSessionChange } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

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
  const fineRows = (sessionFines ?? []) as unknown as SessionFineRow[];
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
    notes: row.fines?.notes ?? null,
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

  return NextResponse.json({ session, fines, changes: changeLog });
}
