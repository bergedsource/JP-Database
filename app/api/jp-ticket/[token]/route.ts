import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter, ticketIpLimiter, ticketLimiter } from "@/lib/rate-limit";
import { waitFor, type TicketStatus, type TicketView } from "@/lib/jp-info";
import { hashTicketToken, loadDocket, nowHearing } from "@/lib/jp-docket";

const NO_STORE = { "Cache-Control": "no-store" };

async function findTicket(token: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("jp_tickets")
    .select("id, member_id, ticket_no, status, session_date, proxy_name, fining_officer")
    .eq("token_hash", hashTicketToken(token))
    .maybeSingle();
  return { service, ticket: data };
}

// GET /api/jp-ticket/[token] — the ticket screen's data. Never returns the phone
// number or anyone else's name.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Per ticket (polled every 15 s) plus a roomy per-IP cap: brothers on the same
  // house wifi share one IP, so the regular public limit would lock them out.
  if (
    (await isRateLimited(ticketLimiter, `t:${token.slice(0, 64)}`)) ||
    (await isRateLimited(ticketIpLimiter, getIP(req)))
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { service, ticket } = await findTicket(token);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404, headers: NO_STORE });

  let docket;
  try {
    docket = await loadDocket(service);
  } catch {
    return NextResponse.json({ error: "Couldn't load the docket" }, { status: 500, headers: NO_STORE });
  }

  const member = docket.members.get(ticket.member_id);
  const skipped = new Set(docket.skipped);
  skipped.delete(ticket.member_id); // his own estimate counts from his real spot
  // Counted to his slot in the officer group this ticket is for.
  const wait = waitFor(ticket.member_id, docket.slots, docket.minutes, skipped, ticket.fining_officer ?? undefined);

  // Once that group's fines are decided he's done, whatever the stored status says.
  let status = ticket.status as TicketStatus;
  if (!wait.onDocket && status !== "cancelled") status = "done";

  const hearing = docket.liveSession ? nowHearing(docket) : null;
  const body: TicketView = {
    ticketNo: ticket.ticket_no ?? 0,
    name: member?.name ?? "Brother",
    roll: member?.roll ?? null,
    status,
    officer: ticket.fining_officer ?? "",
    proxyName: ticket.proxy_name ?? null,
    sessionLive: !!docket.liveSession,
    nowHearing: hearing ? { roll: docket.members.get(hearing.memberId)?.roll ?? null, officer: hearing.officer } : null,
    wait,
    startTime: docket.liveSession ? "" : docket.nextSession?.time ?? "",
  };
  return NextResponse.json(body, { headers: NO_STORE });
}

// DELETE /api/jp-ticket/[token] — the brother cancels; his number is dropped right away.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const { service, ticket } = await findTicket(token);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const { error } = await service.from("jp_tickets").update({ status: "cancelled", phone: null, snapchat: null, proxy_name: null }).eq("id", ticket.id);
  if (error) return NextResponse.json({ error: "Couldn't cancel. Try again." }, { status: 500 });
  return NextResponse.json({ success: true });
}
