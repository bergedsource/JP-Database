import type { SupabaseClient } from "@supabase/supabase-js";
import { NEXT_SESSION_KEY, parseNextSession, todayPacific, type CommonFine, type JpInfo } from "./jp-info";

// Public homepage data, shared by the /api routes and the server-rendered homepage
// (so the page arrives already filled in). Every read goes through the curated
// public_* views, so nothing private is reachable from here.

export type PublicMember = { id: string; name: string; status: string; roll: number | null };
export type PublicSettings = { venmo_handle: string; venmo_url: string };

export const SETTINGS_DEFAULTS: PublicSettings = {
  venmo_handle: "@Dillon-Berge",
  venmo_url: "https://venmo.com/Dillon-Berge",
};

export async function publicMembers(service: SupabaseClient): Promise<PublicMember[] | null> {
  const { data, error } = await service.from("public_members").select("id, name, status, roll").order("name");
  return error ? null : ((data ?? []) as PublicMember[]);
}

export async function publicSettings(service: SupabaseClient): Promise<PublicSettings> {
  const map: PublicSettings = { ...SETTINGS_DEFAULTS };
  try {
    const { data } = await service
      .from("public_settings")
      .select("key, value")
      .in("key", ["venmo_handle", "venmo_url"]);
    for (const row of data ?? []) map[row.key as keyof PublicSettings] = row.value ?? map[row.key as keyof PublicSettings];
  } catch {}
  return map;
}

// The homepage JP cards: the next session the chair has posted, the five most
// common fine types on record. null if the fines can't be read.
export async function jpInfo(service: SupabaseClient): Promise<JpInfo | null> {
  // The next session the chair posted, unless its date has passed.
  let nextSession: JpInfo["nextSession"] = null;
  try {
    const { data } = await service.from("public_settings").select("value").eq("key", NEXT_SESSION_KEY).maybeSingle();
    const posted = parseNextSession(data?.value as string | undefined);
    nextSession = posted && posted.date >= todayPacific() ? posted : null;
  } catch {}

  // The fines table only holds the current year (it's wiped every Jan 4), so this
  // counts everything on record. Paged because PostgREST caps a response at 1000 rows.
  const rows: { fine_type: string; amount: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from("public_member_fines")
      .select("fine_type, amount")
      .range(from, from + 999);
    if (error) return null;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // "Other" is a catch-all for unrelated one-offs, so it isn't one fine and isn't ranked.
  const byType = new Map<string, (number | null)[]>();
  for (const r of rows) {
    if (r.fine_type === "Other") continue;
    const list = byType.get(r.fine_type) ?? [];
    list.push(r.amount);
    byType.set(r.fine_type, list);
  }

  const commonFines: CommonFine[] = [...byType.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([fineType, amounts]) => ({ fineType, count: amounts.length, amount: typicalAmount(amounts) }));

  return { nextSession, commonFines, totalFines: rows.length };
}

// "$10" when every fine of the type costs the same, "Often $100" when one amount is
// most of them, otherwise "Varies".
function typicalAmount(amounts: (number | null)[]): string {
  const known = amounts.filter((a): a is number => a != null);
  if (known.length === 0) return "Varies";
  const counts = new Map<number, number>();
  for (const a of known) counts.set(a, (counts.get(a) ?? 0) + 1);
  const [mode, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const label = `$${Number.isInteger(mode) ? mode : mode.toFixed(2)}`;
  if (n === known.length) return label;
  if (n / known.length >= 0.3) return `Often ${label}`;
  return "Varies";
}
