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
export function waitRange(minutes: number): { lo: number; hi: number } {
  return {
    lo: Math.max(0, Math.floor((minutes * 0.85) / 5) * 5),
    hi: Math.ceil((minutes * 1.15) / 5) * 5,
  };
}

// ── Settings parsing (values are stored as JSON strings in `settings`) ──

export const NEXT_SESSION_KEY = "next_jp_session";
export const HEARING_MINUTES_KEY = "jp_hearing_minutes";

export type NextSession = { date: string; time: string; place: string };

export function parseNextSession(raw: string | null | undefined): NextSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
      return {
        date: v.date,
        time: typeof v.time === "string" && /^\d{2}:\d{2}$/.test(v.time) ? v.time : "",
        place: typeof v.place === "string" ? v.place.slice(0, 80) : "",
      };
    }
  } catch {}
  return null;
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

export type JpInfo = {
  nextSession: NextSession | null;
  commonFines: CommonFine[];
  totalFines: number;
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
      // Each brother's minutes in calling order, and which one is you — for the progress bar.
      queue: number[];
      queueIndex: number;
    };
