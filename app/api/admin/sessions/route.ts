import { requireAuth, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/sessions — list all sessions with fine count, newest first
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();

  const { data: sessions, error } = await service
    .from("jp_sessions")
    .select("id, date_held, closed_at, created_at")
    .order("date_held", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get fine counts per session (scoped to fetched sessions only)
  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: counts, error: countsError } = sessionIds.length > 0
    ? await service.from("jp_session_fines").select("session_id").in("session_id", sessionIds)
    : { data: [], error: null };
  if (countsError) return NextResponse.json({ error: countsError.message }, { status: 500 });

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.session_id] = (countMap[row.session_id] ?? 0) + 1;
  }

  const result = (sessions ?? []).map((s) => ({
    ...s,
    fine_count: countMap[s.id] ?? 0,
  }));

  return NextResponse.json(result);
}

// POST /api/admin/sessions — create a new session, snapshot all pending fines
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { date_held } = await req.json();
  if (!date_held || typeof date_held !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date_held)) {
    return NextResponse.json({ error: "date_held must be a YYYY-MM-DD date string" }, { status: 400 });
  }

  const service = createServiceClient();

  // Create the session
  const { data: session, error: sessionError } = await service
    .from("jp_sessions")
    .insert({ date_held })
    .select("id")
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? "Failed to create session" }, { status: 500 });
  }

  // Snapshot all currently pending fines
  const { data: pendingFines } = await service
    .from("fines")
    .select("id")
    .eq("status", "pending");

  if (pendingFines && pendingFines.length > 0) {
    const { error: insertError } = await service.from("jp_session_fines").insert(
      pendingFines.map((f) => ({
        session_id: session.id,
        fine_id: f.id,
        snapshot_status: "pending",
      }))
    );
    if (insertError) {
      // Compensate: delete the orphaned session row
      await service.from("jp_sessions").delete().eq("id", session.id);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: session.id, fine_count: pendingFines?.length ?? 0 });
}
