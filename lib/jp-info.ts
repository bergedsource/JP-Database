// Shared logic for the homepage "JP info" card: next session, hearing-time
// estimates, and the wait calculation. Used by the public API routes, the admin
// Sessions tab, and the homepage.

export type HearingTier = "quick" | "standard" | "long" | "longest";

export type HearingMinutes = Record<HearingTier, number> & { perBrother: number };

export const DEFAULT_HEARING_MINUTES: HearingMinutes = {
  quick: 1.5,
  standard: 3,
  long: 5,
  longest: 8,
  perBrother: 1,
};

export const TIER_LABELS: Record<HearingTier, string> = {
  quick: "Quick",
  standard: "Standard",
  long: "Long",
  longest: "Longest",
};

// Fine types that aren't listed fall into "standard" (custom bylaws, "Other").
const TIER_BY_FINE_TYPE: Record<string, HearingTier> = {
  "House Clean (§11-140)": "quick",
  "Chores (§11-160)": "quick",
  "Grazers (§11-250)": "quick",
  "Bathroom Trash Violation (§11-290)": "quick",
  "Cell Phone in Exec Meeting (§8-060)": "quick",
  "Missing Blood Drive (§16-010)": "quick",
  "Missing Philanthropy Hours (§16-010)": "long",
  "Social Probation Violation (§11-260)": "long",
  "General Misconduct (§11-020)": "longest",
  "Removal/Damage to House Property (§11-080)": "longest",
  "Removal/Damage to Personal Property (§11-090)": "longest",
};

export function tierFor(fineType: string): HearingTier {
  return TIER_BY_FINE_TYPE[fineType] ?? "standard";
}

// What each tier covers, for the admin explainer.
export const TIER_EXAMPLES: Record<HearingTier, string> = {
  quick: "House clean, chores, grazing, bathroom trash, phone in exec, missed blood drive",
  standard: "Missed required event, recruitment or work week, pledge tasks, anything not listed",
  long: "Missed service hours, social probation violation",
  longest: "General misconduct, damage to house or personal property",
};

// Minutes one brother's hearing takes: a fixed walk-in/out cost plus each fine's
// tier time, with repeats of the same fine type at half time (they get settled together).
export function brotherMinutes(fineTypes: string[], m: HearingMinutes): number {
  const seen = new Set<string>();
  let total = m.perBrother;
  for (const t of fineTypes) {
    const base = m[tierFor(t)];
    total += seen.has(t) ? base / 2 : base;
    seen.add(t);
  }
  return total;
}

// Shown as a range so nobody reads it as a promise; rounded out to 5 minutes.
// Deliberately a little cautious (skewed later): research on virtual queues found a
// later-than-promised update drives people off far more than an earlier one, so the
// window should usually move earlier as JP goes, not later.
export function waitRange(minutes: number): { lo: number; hi: number } {
  return {
    lo: Math.max(0, Math.floor((minutes * 0.9) / 5) * 5),
    hi: Math.ceil((minutes * 1.25) / 5) * 5,
  };
}

// "15–25 min", or "Under 10 min" when the low end rounds to zero.
export function waitLabel(minutes: number): string {
  const { lo, hi } = waitRange(minutes);
  return lo === 0 ? `Under ${hi} min` : `${lo}–${hi} min`;
}

// ── Settings parsing (values are stored as JSON strings in `settings`) ──

export const NEXT_SESSION_KEY = "next_jp_session";
// One line the chair posts to every ticket ("On a 10 min break").
export const STATUS_NOTE_KEY = "jp_status_note";
export const HEARING_MINUTES_KEY = "jp_hearing_minutes";

export type NextSession = { date: string; time: string; place: string };

// Tickets open this long before the posted start time (7:00 pm session → 7:00 am).
export const TICKETS_OPEN_HOURS = 12;
// Used when the chair posts a date without a start time.
export const DEFAULT_START = "19:00";

export function ticketsOpenAt(next: NextSession): Date {
  return new Date(pacificToDate(next.date, next.time || DEFAULT_START).getTime() - TICKETS_OPEN_HOURS * 3600 * 1000);
}

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

const PACIFIC = "America/Los_Angeles";

// "YYYY-MM-DD" + "HH:MM" in Pacific time → the real instant (handles PST/PDT).
export function pacificToDate(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess + (guess - asIfUtc));
}

export function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: PACIFIC });
}

// ── Hearing order ──
// JP hears fines grouped by fining officer: the officer who fined the most brothers
// goes first (ties alphabetical); inside a group brothers go by roll # low to high,
// no-roll last. A brother fined by two officers is heard once in each group.

export type PendingFine = { member_id: string; fine_type: string; fining_officer: string | null };

export type DocketSlot = { memberId: string; officer: string; roll: number | null; fines: string[] };

export const NO_OFFICER = "No officer listed";

export function docketOrder(pending: PendingFine[], rollOf: Map<string, number | null>): DocketSlot[] {
  const groups = new Map<string, Map<string, string[]>>();
  for (const f of pending) {
    const officer = f.fining_officer?.trim() || NO_OFFICER;
    const byMember = groups.get(officer) ?? new Map<string, string[]>();
    byMember.set(f.member_id, [...(byMember.get(f.member_id) ?? []), f.fine_type]);
    groups.set(officer, byMember);
  }
  const officers = [...groups.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
  const slots: DocketSlot[] = [];
  for (const [officer, byMember] of officers) {
    const members = [...byMember.entries()]
      .map(([memberId, fines]) => ({ memberId, officer, fines, roll: rollOf.get(memberId) ?? null }))
      .sort((a, b) => {
        if (a.roll === b.roll) return a.memberId.localeCompare(b.memberId);
        if (a.roll === null) return 1;
        if (b.roll === null) return -1;
        return a.roll - b.roll;
      });
    slots.push(...members);
  }
  return slots;
}

// A brother's wait: everything before his first slot, minus brothers the chair has
// skipped (they're not being heard right now). Null when he has nothing pending.
// With `officer`, the wait counts to his slot in that officer's group (a ticket is for
// one group); otherwise to his first slot.
export function waitFor(memberId: string, slots: DocketSlot[], minutes: HearingMinutes, skipped: Set<string> = new Set(), officer?: string): JpWait {
  const active = slots.filter((s) => s.memberId === memberId || !skipped.has(s.memberId));
  const firstIdx = active.findIndex((s) => s.memberId === memberId && (officer === undefined || s.officer === officer));
  if (firstIdx === -1) return { onDocket: false };

  const queue = active.map((s) => brotherMinutes(s.fines, minutes));
  const ahead = active.slice(0, firstIdx);
  const own = active.filter((s) => s.memberId === memberId);
  const counts = new Map<string, number>();
  for (const s of own) for (const t of s.fines) counts.set(t, (counts.get(t) ?? 0) + 1);

  return {
    onDocket: true,
    place: firstIdx + 1,
    docketSize: active.length,
    brothersAhead: ahead.length,
    finesAhead: ahead.reduce((n, s) => n + s.fines.length, 0),
    minutesAhead: queue.slice(0, firstIdx).reduce((n, m) => n + m, 0),
    ownMinutes: own.reduce((n, s) => n + brotherMinutes(s.fines, minutes), 0),
    ownFines: [...counts.entries()].map(([fineType, count]) => ({ fineType, count })),
    queue,
    queueIndex: firstIdx,
    groups: own.map((s) => {
      const group = active.filter((g) => g.officer === s.officer);
      return { officer: s.officer, place: group.indexOf(s) + 1, size: group.length };
    }),
  };
}

export function parseHearingMinutes(raw: string | null | undefined): HearingMinutes {
  const out = { ...DEFAULT_HEARING_MINUTES };
  if (!raw) return out;
  try {
    const v = JSON.parse(raw);
    for (const k of Object.keys(out) as (keyof HearingMinutes)[]) {
      const n = Number(v?.[k]);
      if (isFinite(n) && n >= 0 && n <= 60) out[k] = n;
    }
  } catch {}
  return out;
}

// ── Learning from real sessions ──
// Stored alongside the tier minutes (same setting) as running totals across sessions:
// how long hearings actually took vs. what the tiers predicted for them.
export type LearnedTiming = { actual: number; predicted: number; slots: number };
export const MIN_LEARNED_SLOTS = 5;

export function parseLearned(raw: string | null | undefined): LearnedTiming | null {
  try {
    const l = raw ? JSON.parse(raw)?.learned : null;
    if (l && [l.actual, l.predicted, l.slots].every((n) => typeof n === "number" && isFinite(n) && n >= 0)) {
      return { actual: l.actual, predicted: l.predicted, slots: l.slots };
    }
  } catch {}
  return null;
}

// Actual ÷ predicted once there's enough data (kept between 0.5× and 3× so one odd
// night can't wreck the estimates); 1 until then.
export function learnedScale(l: LearnedTiming | null): number {
  if (!l || l.slots < MIN_LEARNED_SLOTS || l.predicted <= 0) return 1;
  return Math.min(3, Math.max(0.5, l.actual / l.predicted));
}

export function scaleMinutes(m: HearingMinutes, scale: number): HearingMinutes {
  return {
    quick: m.quick * scale,
    standard: m.standard * scale,
    long: m.long * scale,
    longest: m.longest * scale,
    perBrother: m.perBrother * scale,
  };
}

// "19:00" → "7:00 pm"
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Start time plus an offset: ("19:00", 15) → "7:15 pm"
export function clockAfter(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + Math.round(minutes);
  return formatTime(`${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
}

// ── API response shapes ──

export type CommonFine = { fineType: string; count: number; amount: string };

export type TicketWindow =
  | { state: "none" }                  // no session posted or running: tickets unavailable
  | { state: "soon"; opensAt: string } // posted; tickets open at this ISO instant
  | { state: "open" };                 // take a ticket now

export type JpInfo = {
  nextSession: NextSession | null;
  commonFines: CommonFine[];
  totalFines: number;
  tickets: TicketWindow;
  sessionLive: boolean; // a JP session is running right now
  // The hearing line by officer group, in hearing order (skipped brothers left
  // out), for "Who's in line". Each group lists its first few brothers.
  line: {
    groups: { officer: string; brothers: number; upNext: { roll: number | null; name: string }[] }[];
    brothers: number; // distinct brothers on the docket
  };
  // Members who issued a fine in the last 30 days, A–Z: the only officers a
  // brother can pick when taking a ticket.
  recentOfficers: string[];
};

export type JpWait =
  | { onDocket: false }
  | {
      onDocket: true;
      place: number;
      docketSize: number;
      brothersAhead: number;
      finesAhead: number;
      minutesAhead: number;
      ownMinutes: number;
      ownFines: { fineType: string; count: number }[];
      // Each slot's minutes in calling order, and where you first come up — for the progress bar.
      queue: number[];
      queueIndex: number;
      // Your place in each fining officer's group you're in.
      groups: { officer: string; place: number; size: number }[];
    };

// ── Tickets ──

export type TicketStatus = "waiting" | "here" | "called" | "done" | "skipped" | "cancelled";

export type TicketView = {
  ticketNo: number;
  name: string;
  roll: number | null;
  status: TicketStatus;
  officer: string; // the fining officer's group this ticket is for
  proxyName: string | null; // someone attending JP on his behalf; the chair calls the proxy
  sessionLive: boolean;
  nowHearing: { roll: number | null; officer: string } | null;
  wait: JpWait;
  startTime: string; // "HH:MM" of the session, "" if unknown
  note: string; // the chair's status line, "" if none
  upholdOn: string; // YYYY-MM-DD a missed fine for this ticket's group is upheld
};

// "(541) 555-1234", "541.555.1234", "+1 541 555 1234" → "+15415551234"; null if not a US number.
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// "@Jordan.Lee" → "jordan.lee"; null unless it looks like a Snapchat username
// (3–15 chars, starts with a letter, letters/digits/. _ -).
export function normalizeSnapchat(raw: string): string | null {
  const u = raw.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z][a-z0-9._-]{2,14}$/.test(u) ? u : null;
}

export function formatPhone(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}
