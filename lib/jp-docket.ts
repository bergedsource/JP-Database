// Server-only: loads everything the wait estimate and ticket queue need, from the
// curated public views plus the (service-role-only) tickets table. Used by the public
// jp-info / jp-wait / jp-ticket routes and the admin queue routes so they all agree
// on the order and on whether tickets are open.

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HEARING_MINUTES_KEY,
  NEXT_SESSION_KEY,
  NO_OFFICER,
  brotherMinutes,
  docketOrder,
  learnedScale,
  parseHearingMinutes,
  parseLearned,
  parseNextSession,
  scaleMinutes,
  ticketsOpenAt,
  todayPacific,
  type DocketSlot,
  type HearingMinutes,
  type NextSession,
  type PendingFine,
  type TicketWindow,
} from "./jp-info";

export type Docket = {
  slots: DocketSlot[];
  minutes: HearingMinutes;
  members: Map<string, { name: string; roll: number | null }>;
  nextSession: NextSession | null; // posted and not in the past
  liveSession: { id: string; date: string } | null; // started and not closed
  ticketDate: string | null; // the JP night tickets currently belong to
  tickets: TicketWindow;
  skipped: Set<string>; // member ids the chair has skipped tonight
};

export async function loadDocket(service: SupabaseClient): Promise<Docket> {
  const [pendingRes, membersRes, settingsRes, liveRes] = await Promise.all([
    service.from("public_member_fines").select("member_id, fine_type, fining_officer").eq("status", "pending"),
    service.from("public_members").select("id, name, roll"),
    service.from("public_settings").select("key, value").in("key", [NEXT_SESSION_KEY, HEARING_MINUTES_KEY]),
    service.from("jp_sessions").select("id, date_held").is("closed_at", null).order("date_held", { ascending: false }).limit(1),
  ]);
  if (pendingRes.error || membersRes.error) throw new Error("Failed to load docket");

  const setting = (k: string) => settingsRes.data?.find((r) => r.key === k)?.value;
  // Tier minutes, scaled by what past sessions actually took (once there's enough data).
  const rawMinutes = setting(HEARING_MINUTES_KEY);
  const minutes = scaleMinutes(parseHearingMinutes(rawMinutes), learnedScale(parseLearned(rawMinutes)));
  const posted = parseNextSession(setting(NEXT_SESSION_KEY));
  const today = todayPacific();
  const nextSession = posted && posted.date >= today ? posted : null;
  const live = liveRes.data?.[0] ? { id: liveRes.data[0].id as string, date: liveRes.data[0].date_held as string } : null;

  const members = new Map(
    (membersRes.data ?? []).map((m) => [m.id as string, { name: m.name as string, roll: (m.roll as number | null) ?? null }])
  );
  const rollOf = new Map([...members].map(([id, m]) => [id, m.roll]));
  const slots = docketOrder((pendingRes.data ?? []) as PendingFine[], rollOf);

  // Tickets: open while a session is running; otherwise from 12 hours before the
  // posted start time.
  let tickets: TicketWindow = { state: "none" };
  let ticketDate: string | null = null;
  if (live) {
    tickets = { state: "open" };
    ticketDate = live.date;
  } else if (nextSession) {
    const opensAt = ticketsOpenAt(nextSession);
    ticketDate = nextSession.date;
    tickets = Date.now() >= opensAt.getTime() ? { state: "open" } : { state: "soon", opensAt: opensAt.toISOString() };
  }

  let skipped = new Set<string>();
  let ordered = slots;
  if (ticketDate) {
    const { data } = await service
      .from("jp_tickets")
      .select("member_id, status, requeued")
      .eq("session_date", ticketDate)
      .or("status.eq.skipped,requeued.eq.true");
    skipped = new Set((data ?? []).filter((r) => r.status === "skipped").map((r) => r.member_id as string));
    const requeued = new Set((data ?? []).filter((r) => r.requeued).map((r) => r.member_id as string));
    ordered = moveToGroupEnd(slots, requeued);
  }

  return { slots: ordered, minutes, members, nextSession, liveSession: live, ticketDate, tickets, skipped };
}

// Brothers who came back after their spot passed are heard at the end of each of
// their officer groups (keeping everyone else's order).
function moveToGroupEnd(slots: DocketSlot[], requeued: Set<string>): DocketSlot[] {
  if (requeued.size === 0) return slots;
  const out: DocketSlot[] = [];
  let i = 0;
  while (i < slots.length) {
    const officer = slots[i].officer;
    const group: DocketSlot[] = [];
    while (i < slots.length && slots[i].officer === officer) group.push(slots[i++]);
    out.push(...group.filter((s) => !requeued.has(s.memberId)), ...group.filter((s) => requeued.has(s.memberId)));
  }
  return out;
}

// Un-skip a brother (he's here now). If JP has already moved past his spot, he's
// heard at the end of his officer group instead of jumping in front of whoever's up.
// From a ticket link (ticketId set) it only touches that ticket plus skipped rows, so
// one ticket can't pull his other officers' tickets out of the waiting line.
export async function markHere(service: SupabaseClient, memberId: string, ticketId?: string): Promise<string | null> {
  const docket = await loadDocket(service);
  if (!docket.ticketDate) return "No JP session is open.";
  const now = docket.slots.findIndex((s) => !docket.skipped.has(s.memberId));
  const mine = docket.slots.findIndex((s) => s.memberId === memberId);
  const passed = docket.skipped.has(memberId) && now !== -1 && mine !== -1 && mine < now;

  // Here/skip apply to the brother, so every row he has tonight (each officer's
  // ticket plus any chair row) changes together.
  const { data: rows } = await service
    .from("jp_tickets")
    .select("id, requeued, status")
    .eq("session_date", docket.ticketDate)
    .eq("member_id", memberId);
  const open = (rows ?? []).filter(
    (r) => r.status !== "cancelled" && r.status !== "done" && (!ticketId || r.id === ticketId || r.status === "skipped"),
  );
  const requeued = open.some((r) => r.requeued) || passed;
  const { error } = open.length
    ? await service.from("jp_tickets").update({ status: "here", requeued }).in("id", open.map((r) => r.id))
    : await service.from("jp_tickets").insert({ session_date: docket.ticketDate, member_id: memberId, source: "chair", status: "here", requeued });
  return error ? "Couldn't update. Try again." : null;
}

// Skip a brother tonight (all his rows), creating a chair row if he has none.
export async function markSkipped(service: SupabaseClient, date: string, memberId: string): Promise<string | null> {
  const { data: rows } = await service.from("jp_tickets").select("id, status").eq("session_date", date).eq("member_id", memberId);
  const open = (rows ?? []).filter((r) => r.status !== "cancelled" && r.status !== "done");
  const { error } = open.length
    ? await service.from("jp_tickets").update({ status: "skipped" }).in("id", open.map((r) => r.id))
    : await service.from("jp_tickets").insert({ session_date: date, member_id: memberId, source: "chair", status: "skipped" });
  return error ? "Couldn't update. Try again." : null;
}

// Ticket links carry a random secret; only its hash is stored, so a database read
// can't be turned back into working links.
export function newTicketToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashTicketToken(token) };
}

export function hashTicketToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Who's being heard now: the first slot not belonging to a skipped brother.
export function nowHearing(d: Docket): DocketSlot | null {
  return d.slots.find((s) => !d.skipped.has(s.memberId)) ?? null;
}

// Mark the next waiting ticket holder in hearing order (from whoever's up now) as
// called. Returns who, or null if no ticket holder is waiting.
export async function callNext(service: SupabaseClient, date: string): Promise<{ memberId: string; officer: string } | null> {
  const docket = await loadDocket(service);
  const { data: rows } = await service.from("jp_tickets").select("member_id, fining_officer, status, phone, snapchat").eq("session_date", date);
  const waiting = new Set(
    (rows ?? []).filter((t) => t.status === "waiting" && t.fining_officer && (t.phone || t.snapchat != null)).map((t) => `${t.member_id}|${t.fining_officer}`)
  );
  const start = Math.max(0, docket.slots.findIndex((s) => !docket.skipped.has(s.memberId)));
  const next = docket.slots.slice(start).find((s) => !docket.skipped.has(s.memberId) && waiting.has(`${s.memberId}|${s.officer}`));
  if (!next) return null;
  const { error } = await service
    .from("jp_tickets")
    .update({ status: "called", called_at: new Date().toISOString() })
    .eq("session_date", date)
    .eq("member_id", next.memberId)
    .eq("fining_officer", next.officer);
  return error ? null : { memberId: next.memberId, officer: next.officer };
}

// Gaps longer than this between decisions are breaks, not hearing time.
const MAX_GAP_MIN = 20;

// When a session closes: measure how long each brother's hearing (one officer group)
// actually took from the decision timestamps, compare with what the tiers predicted,
// and add both to the running totals stored with the hearing minutes.
export async function learnFromSession(service: SupabaseClient, sessionId: string): Promise<void> {
  const { data: changes } = await service
    .from("jp_session_changes")
    .select("fine_id, changed_at")
    .eq("session_id", sessionId)
    .order("changed_at", { ascending: true });
  if (!changes || changes.length < 2) return;

  const fineIds = [...new Set(changes.map((c) => c.fine_id as string))];
  const { data: fines } = await service.from("fines").select("id, member_id, fine_type, fining_officer").in("id", fineIds);
  const fineInfo = new Map((fines ?? []).map((f) => [f.id as string, f]));

  // Each gap between consecutive decisions is time spent on the later decision's hearing.
  const slots = new Map<string, { actual: number; types: Map<string, string> }>();
  for (let i = 1; i < changes.length; i++) {
    const f = fineInfo.get(changes[i].fine_id as string);
    if (!f) continue;
    const gap = (new Date(changes[i].changed_at).getTime() - new Date(changes[i - 1].changed_at).getTime()) / 60000;
    if (gap <= 0 || gap > MAX_GAP_MIN) continue;
    const key = `${f.member_id}|${f.fining_officer?.trim() || NO_OFFICER}`;
    const slot = slots.get(key) ?? { actual: 0, types: new Map<string, string>() };
    slot.actual += gap;
    slot.types.set(f.id as string, f.fine_type as string);
    slots.set(key, slot);
  }
  if (slots.size === 0) return;

  const { data: row } = await service.from("settings").select("value").eq("key", HEARING_MINUTES_KEY).maybeSingle();
  const tiers = parseHearingMinutes(row?.value);
  const prev = parseLearned(row?.value) ?? { actual: 0, predicted: 0, slots: 0 };
  let actual = 0;
  let predicted = 0;
  for (const s of slots.values()) {
    actual += s.actual;
    predicted += brotherMinutes([...s.types.values()], tiers);
  }
  const learned = { actual: prev.actual + actual, predicted: prev.predicted + predicted, slots: prev.slots + slots.size };
  await service.from("settings").upsert({
    key: HEARING_MINUTES_KEY,
    value: JSON.stringify({ ...tiers, learned }),
    updated_at: new Date().toISOString(),
  });
}

// A fine was just decided. When it went from pending to a decision and it was the
// brother's last pending fine from that officer, his ticket for that officer's group
// is done and the next waiting ticket holder is called. Shared by every path that
// changes a fine's status (JP session screen, Fines tab), so the line always moves.
// Re-deciding an already-decided fine does nothing here (no extra call-forward).
// sessionDate: the night the tickets belong to; defaults to the running session's.
export async function afterDecision(
  service: SupabaseClient,
  fine: { member_id: string; fining_officer: string | null },
  oldStatus: string,
  newStatus: string,
  sessionDate?: string
): Promise<void> {
  if (oldStatus !== "pending" || newStatus === "pending") return;
  const officer = fine.fining_officer?.trim() || NO_OFFICER;

  // Same officer key as the docket: trimmed name, blank → "No officer listed".
  const { data: pending } = await service
    .from("fines")
    .select("fining_officer")
    .eq("member_id", fine.member_id)
    .eq("status", "pending");
  if ((pending ?? []).some((p) => ((p.fining_officer as string | null)?.trim() || NO_OFFICER) === officer)) return;

  let date = sessionDate;
  if (!date) {
    const { data: live } = await service
      .from("jp_sessions")
      .select("date_held")
      .is("closed_at", null)
      .order("date_held", { ascending: false })
      .limit(1);
    date = live?.[0]?.date_held as string | undefined;
  }
  if (!date) return; // no JP running: nothing to move

  await service
    .from("jp_tickets")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("session_date", date)
    .eq("member_id", fine.member_id)
    .eq("fining_officer", officer)
    .neq("status", "cancelled");
  await callNext(service, date);
}
