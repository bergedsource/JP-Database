import type { SupabaseClient } from "@supabase/supabase-js";

// Fines a brother missed at JP (still pending when the session closed) are upheld
// 15 days after the session date: a session on Oct 1 upholds them on Oct 16.
export const MISSED_UPHOLD_DAYS = 15;

export function missedUpholdDate(sessionDate: string): string {
  const d = new Date(`${sessionDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + MISSED_UPHOLD_DAYS);
  return d.toISOString().split("T")[0];
}

// Daily (cron): uphold missed fines whose 15 days are up. Only fines from a CLOSED
// session that are still pending — anything the chair decided is left alone, and an
// owner's "+1 week" (a later review_deadline) pushes it back.
export async function upholdMissedFines(service: SupabaseClient, now: Date): Promise<void> {
  const { data } = await service
    .from("jp_session_fines")
    .select("session_id, fine_id, jp_sessions(date_held, closed_at), fines(status, review_deadline, fine_type, members(name))");
  type Row = {
    session_id: string;
    fine_id: string;
    jp_sessions: { date_held: string; closed_at: string | null } | null;
    fines: { status: string; review_deadline: string | null; fine_type: string; members: { name: string } | null } | null;
  };
  const due = new Map<string, Row>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.jp_sessions?.closed_at || r.fines?.status !== "pending") continue;
    const upholdOn = missedUpholdDate(r.jp_sessions.date_held);
    const deadline = r.fines.review_deadline ? new Date(r.fines.review_deadline) : new Date(`${upholdOn}T12:00:00Z`);
    if (deadline > now || `${now.toISOString().split("T")[0]}` < upholdOn) continue;
    due.set(r.fine_id, r);
  }
  if (due.size === 0) return;

  const ids = [...due.keys()];
  const { error } = await service
    .from("fines")
    .update({ status: "upheld", date_resolved: null, labor_completed_at: null })
    .in("id", ids)
    .eq("status", "pending");
  if (error) return;

  const rows = [...due.values()];
  await service.from("audit_logs").insert({
    admin_email: "system",
    action: "Missed Fines Upheld (15 days)",
    details: rows.map((r) => `${r.fines?.members?.name ?? "Unknown"} — ${r.fines?.fine_type} (JP ${r.jp_sessions?.date_held})`).join("; "),
  });
}
