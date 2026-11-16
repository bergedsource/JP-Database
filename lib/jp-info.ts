// Shared JP helpers: the posted next session, Pacific dates, officer hearing order,
// and the homepage JP card data shape.

// ── Settings parsing (values are stored as JSON strings in `settings`) ──

export const NEXT_SESSION_KEY = "next_jp_session";

export type NextSession = { date: string; time: string; place: string };

const HHMM = /^\d{2}:\d{2}$/;

export function parseNextSession(raw: string | null | undefined): NextSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
      return {
        date: v.date,
        time: typeof v.time === "string" && HHMM.test(v.time) ? v.time : "",
        place: typeof v.place === "string" ? v.place.slice(0, 80) : "",
      };
    }
  } catch {}
  return null;
}

// ── Pacific time (the chapter's clock, whatever timezone the server runs in) ──

export function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// ── Hearing order ──
// JP hears fines grouped by fining officer: the officer who fined the most brothers
// goes first (ties alphabetical); inside a group brothers go by roll # low to high.

export const NO_OFFICER = "No officer listed";

// Officer hearing order for a session, fixed when it starts: whoever fined the most
// distinct brothers in the session's fines goes first, ties A–Z. Ranking from the
// session snapshot (not what's still pending) keeps JP on one officer until his group
// is done instead of jumping when another officer's group becomes the bigger one.
export function officerRank(rows: { member_id: string; fining_officer: string | null }[]): string[] {
  const brothers = new Map<string, Set<string>>();
  for (const r of rows) {
    const officer = r.fining_officer?.trim() || NO_OFFICER;
    brothers.set(officer, (brothers.get(officer) ?? new Set()).add(r.member_id));
  }
  return [...brothers.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).map(([o]) => o);
}

// "19:00" → "7:00 pm"
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// ── API response shapes ──

export type CommonFine = { fineType: string; count: number; amount: string };

export type JpInfo = {
  nextSession: NextSession | null;
  commonFines: CommonFine[];
  totalFines: number;
};
