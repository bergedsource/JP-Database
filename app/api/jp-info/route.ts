import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { todayPacific, type CommonFine, type JpInfo } from "@/lib/jp-info";
import { loadDocket } from "@/lib/jp-docket";

// GET /api/jp-info — public data for the homepage JP card: the next session the
// chair has posted, the five most common fine types on record, and the front of
// the hearing line (name + roll # in order, like the public member search shows).
export async function GET(req: Request) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const service = createServiceClient();

  // Next session + whether tickets are open (shared with the ticket routes so they
  // agree). Until migration_jp_info_settings.sql runs, nothing is "posted".
  let nextSession: JpInfo["nextSession"] = null;
  let tickets: JpInfo["tickets"] = { state: "none" };
  let sessionLive = false;
  let line: JpInfo["line"] = { groups: [], brothers: 0 };
  try {
    const docket = await loadDocket(service);
    nextSession = docket.nextSession;
    tickets = docket.tickets;
    sessionLive = !!docket.liveSession;
    // Names and roll #s are already public (public_members); only the order is new.
    // Slots are already in hearing order, grouped by officer.
    const groups: JpInfo["line"]["groups"] = [];
    for (const s of docket.slots) {
      let g = groups.find((x) => x.officer === s.officer);
      if (!g) groups.push((g = { officer: s.officer, brothers: 0, upNext: [] }));
      g.brothers++;
      if (!docket.skipped.has(s.memberId) && g.upNext.length < 5) {
        g.upNext.push({ roll: s.roll, name: docket.members.get(s.memberId)?.name ?? "Unknown" });
      }
    }
    line = { groups, brothers: new Set(docket.slots.map((s) => s.memberId)).size };
  } catch {}

  // The fines table only holds the current year (it's wiped every Jan 4), so this
  // counts everything on record. Paged because PostgREST caps a response at 1000 rows.
  const rows: { fine_type: string; amount: number | null; fining_officer: string | null; date_issued: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from("public_member_fines")
      .select("fine_type, amount, fining_officer, date_issued")
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

  // Officers who fined anyone in the last 30 days (Pacific dates).
  const [y, m, d] = todayPacific().split("-").map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1, d - 30)).toISOString().slice(0, 10);
  const recentOfficers = [...new Set(
    rows.filter((r) => r.date_issued >= cutoff && r.fining_officer?.trim()).map((r) => r.fining_officer!.trim())
  )].sort((a, b) => a.localeCompare(b));

  const body: JpInfo = { nextSession, commonFines, totalFines: rows.length, tickets, sessionLive, line, recentOfficers };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
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
