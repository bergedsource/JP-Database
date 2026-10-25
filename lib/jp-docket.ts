// Server-only: loads everything the wait estimate and ticket queue need, from the
// curated public views plus the (service-role-only) tickets table. Used by the public
// jp-info / jp-wait / jp-ticket routes and the admin queue routes so they all agree
// on the order and on whether tickets are open.

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HEARING_MINUTES_KEY,
  NEXT_SESSION_KEY,
  docketOrder,
  parseHearingMinutes,
  parseNextSession,
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
  const minutes = parseHearingMinutes(setting(HEARING_MINUTES_KEY));
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
export async function markHere(service: SupabaseClient, memberId: string): Promise<string | null> {
  const docket = await loadDocket(service);
  if (!docket.ticketDate) return "No JP session is open.";
  const now = docket.slots.findIndex((s) => !docket.skipped.has(s.memberId));
  const mine = docket.slots.findIndex((s) => s.memberId === memberId);
  const passed = docket.skipped.has(memberId) && now !== -1 && mine !== -1 && mine < now;

  const { data: existing } = await service
    .from("jp_tickets")
    .select("id, requeued")
    .eq("session_date", docket.ticketDate)
    .eq("member_id", memberId)
    .maybeSingle();
  const patch = { status: "here", requeued: (existing?.requeued ?? false) || passed };
  const { error } = existing
    ? await service.from("jp_tickets").update(patch).eq("id", existing.id)
    : await service.from("jp_tickets").insert({ session_date: docket.ticketDate, member_id: memberId, source: "chair", ...patch });
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
