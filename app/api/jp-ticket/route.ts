import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/jp-info";
import { loadDocket, newTicketToken } from "@/lib/jp-docket";

// POST /api/jp-ticket — a brother takes a ticket for tonight's JP: { member_id, phone }.
// Allowed only while tickets are open and only for brothers with a pending fine.
// Returns the ticket link's secret once; only its hash is stored.
export async function POST(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const memberId = typeof body.member_id === "string" ? body.member_id : "";
  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : null;
  // Sending a proxy: the phone number given is the proxy's, and the chair calls them.
  const proxyName = typeof body.proxy_name === "string" ? body.proxy_name.trim().slice(0, 60) : "";
  if (body.proxy === true && !proxyName) return NextResponse.json({ error: "Enter your proxy's name." }, { status: 400 });
  if (!memberId) return NextResponse.json({ error: "Missing member" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Enter a 10-digit US phone number." }, { status: 400 });

  const service = createServiceClient();
  let docket;
  try {
    docket = await loadDocket(service);
  } catch {
    return NextResponse.json({ error: "Couldn't load the docket. Try again." }, { status: 500 });
  }

  if (docket.tickets.state !== "open" || !docket.ticketDate) {
    return NextResponse.json({ error: "Tickets aren't open right now." }, { status: 409 });
  }
  if (!docket.slots.some((s) => s.memberId === memberId)) {
    return NextResponse.json({ error: "Tickets are only for brothers with a fine on tonight's docket." }, { status: 409 });
  }

  const date = docket.ticketDate;
  const { data: existing } = await service
    .from("jp_tickets")
    .select("id, source, status, phone")
    .eq("session_date", date)
    .eq("member_id", memberId)
    .maybeSingle();

  // One ticket per brother per night. A row the chair made (he was skipped) or a
  // cancelled ticket can be turned into a fresh one.
  const reusable = existing && (existing.status === "cancelled" || (existing.source === "chair" && !existing.phone));
  if (existing && !reusable) {
    return NextResponse.json({ error: "You already have a ticket. Ask the JP Chair if you lost the link." }, { status: 409 });
  }

  const { data: last } = await service
    .from("jp_tickets")
    .select("ticket_no")
    .eq("session_date", date)
    .not("ticket_no", "is", null)
    .order("ticket_no", { ascending: false })
    .limit(1);
  const ticketNo = ((last?.[0]?.ticket_no as number | undefined) ?? 0) + 1;

  const { token, hash } = newTicketToken();
  const row = {
    session_date: date,
    member_id: memberId,
    ticket_no: ticketNo,
    phone,
    proxy_name: proxyName || null,
    token_hash: hash,
    source: "member",
    status: "waiting",
    called_at: null,
    done_at: null,
  };
  const { error } = existing
    ? await service.from("jp_tickets").update(row).eq("id", existing.id)
    : await service.from("jp_tickets").insert(row);
  if (error) {
    // Unique (session_date, member_id): a double-tap raced us.
    if (error.code === "23505") {
      return NextResponse.json({ error: "You already have a ticket. Ask the JP Chair if you lost the link." }, { status: 409 });
    }
    return NextResponse.json({ error: "Couldn't create the ticket. Try again." }, { status: 500 });
  }

  return NextResponse.json({ token, ticketNo }, { headers: { "Cache-Control": "no-store" } });
}
