import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { NEXT_SESSION_KEY, parseNextSession, type CommonFine, type JpInfo } from "@/lib/jp-info";

// GET /api/jp-info — public data for the homepage JP card: the next session the
// chair has posted and the five most common fine types on record. Aggregates only;
// no member is identified.
export async function GET(req: Request) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const service = createServiceClient();

  // Reads curated views only (see migration_public_read_views.sql and
  // migration_jp_info_settings.sql). Until the settings migration runs, the
  // next-session key just isn't visible and the card shows "not scheduled".
  const { data: settingRows } = await service
    .from("public_settings")
    .select("key, value")
    .eq("key", NEXT_SESSION_KEY);
  // A date that has already passed is stale (nobody cleared it) — don't advertise it.
  const posted = parseNextSession(settingRows?.[0]?.value);
  const todayPacific = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const nextSession = posted && posted.date >= todayPacific ? posted : null;

  // The fines table only holds the current year (it's wiped every Jan 4), so this
  // counts everything on record. Paged because PostgREST caps a response at 1000 rows.
  const rows: { fine_type: string; amount: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from("public_member_fines")
      .select("fine_type, amount")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: "Failed to load fines" }, { status: 500 });
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

  const body: JpInfo = { nextSession, commonFines, totalFines: rows.length };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
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
