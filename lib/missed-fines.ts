// Fines a brother missed at JP (still pending when the session closed) get a review
// deadline 15 days after the session date: a session on Oct 1 flags them on Oct 16.
// They are not upheld automatically; an owner upholds or extends them from the overdue flag.
export const MISSED_UPHOLD_DAYS = 15;

export function missedUpholdDate(sessionDate: string): string {
  const d = new Date(`${sessionDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + MISSED_UPHOLD_DAYS);
  return d.toISOString().split("T")[0];
}

