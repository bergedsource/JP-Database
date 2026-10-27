import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { waitFor } from "./jp-info";
import type { Docket } from "./jp-docket";

// Web push for JP tickets. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT in the environment; without them every send is a quiet no-op.
// Sending is best effort and never throws into the caller (the queue must move).

const NEAR_AHEAD = 2; // "almost up" once this many brothers (or fewer) are ahead

let configured: boolean | null = null;
function ready(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  configured = !!(pub && priv && subject);
  if (configured) webpush.setVapidDetails(subject!, pub!, priv!);
  return configured;
}

type Payload = { title: string; body: string; tag: string };

async function pushToTickets(service: SupabaseClient, ticketIds: string[], payload: Payload): Promise<void> {
  if (!ready() || ticketIds.length === 0) return;
  const { data: subs } = await service
    .from("jp_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("ticket_id", ticketIds);
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          JSON.stringify({ ...payload, url: "/" }),
          { TTL: 600, urgency: "high" }
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id as string); // unsubscribed or expired
      }
    })
  );
  if (dead.length) await service.from("jp_push_subscriptions").delete().in("id", dead);
}

// The chair just called this brother's ticket for this officer.
export async function notifyCalled(service: SupabaseClient, date: string, memberId: string, officer: string): Promise<void> {
  try {
    const { data } = await service
      .from("jp_tickets")
      .select("id, proxy_name")
      .eq("session_date", date)
      .eq("member_id", memberId)
      .eq("fining_officer", officer)
      .neq("status", "cancelled");
    const ids = (data ?? []).map((t) => t.id as string);
    const proxy = data?.[0]?.proxy_name as string | null | undefined;
    await pushToTickets(service, ids, {
      title: "You're being called at JP",
      body: proxy ? `Send ${proxy} to JP now.` : "Head to JP now.",
      tag: `called-${ids[0] ?? memberId}`,
    });
  } catch {}
}

// While JP is running: tell each waiting ticket holder once when he's nearly up.
export async function notifyNear(service: SupabaseClient, docket: Docket): Promise<void> {
  try {
    if (!docket.liveSession || !docket.ticketDate || !ready()) return;
    const { data: tickets } = await service
      .from("jp_tickets")
      .select("id, member_id, fining_officer")
      .eq("session_date", docket.ticketDate)
      .eq("status", "waiting")
      .eq("push_near_sent", false)
      .not("fining_officer", "is", null);
    for (const t of tickets ?? []) {
      const skipped = new Set(docket.skipped);
      skipped.delete(t.member_id as string);
      const w = waitFor(t.member_id as string, docket.slots, docket.minutes, skipped, t.fining_officer as string);
      if (!w.onDocket || w.brothersAhead > NEAR_AHEAD) continue;
      await service.from("jp_tickets").update({ push_near_sent: true }).eq("id", t.id);
      await pushToTickets(service, [t.id as string], {
        title: w.brothersAhead === 0 ? "You're next at JP" : "Almost up at JP",
        body: w.brothersAhead === 0 ? "Start heading to JP." : `${w.brothersAhead} brother${w.brothersAhead === 1 ? "" : "s"} ahead of you. Get ready.`,
        tag: `near-${t.id}`,
      });
    }
  } catch {}
}
