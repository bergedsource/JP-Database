import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { normalizePhone, normalizeSnapchat } from "@/lib/jp-info";
import { loadDocket, newTicketToken } from "@/lib/jp-docket";

// POST /api/jp-ticket — a brother takes a ticket for tonight's JP:
// { member_id, fining_officer, contact: "phone" | "snapchat", phone | snapchat, proxy?, proxy_name? }.
// Allowed only while tickets are open and only for brothers with a pending fine.
// Returns the ticket link's secret once; only its hash is stored.
export async function POST(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const memberId = typeof body.member_id === "string" ? body.member_id : "";
  // Contact by phone (default) or Snapchat. Sending a proxy: the contact given is the
  // proxy's, and the chair reaches them instead.
  const bySnap = body.contact === "snapchat";
  const phone = !bySnap && typeof body.phone === "string" ? normalizePhone(body.phone) : null;
  // By Snapchat for himself: the chair already has his Snapchat, so no username is
  // asked for and "" is stored to mean "Snapchat him". A proxy's username is required.
  const snapchat = !bySnap ? null : body.proxy === true ? normalizeSnapchat(typeof body.snapchat === "string" ? body.snapchat : "") : "";
  const proxyName = typeof body.proxy_name === "string" ? body.proxy_name.trim().slice(0, 60) : "";
  if (body.proxy === true && !proxyName) return NextResponse.json({ error: "Enter your proxy's name." }, { status: 400 });
  if (!memberId) return NextResponse.json({ error: "Missing member" }, { status: 400 });
  // A ticket is for one fining officer's group; he must say which.
  const officer = typeof body.fining_officer === "string" ? body.fining_officer.trim() : "";
  if (!officer) return NextResponse.json({ error: "Choose your fining officer." }, { status: 400 });
  if (bySnap && snapchat === null) return NextResponse.json({ error: "Enter your proxy's Snapchat username (3–15 letters, numbers, . _ -)." }, { status: 400 });
  if (!bySnap && !phone) return NextResponse.json({ error: "Enter a 10-digit US phone number." }, { status: 400 });

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
  if (!docket.slots.some((s) => s.memberId === memberId && s.officer === officer)) {
    return NextResponse.json({ error: `You don't have a pending fine from ${officer}.` }, { status: 409 });
  }

  const date = docket.ticketDate;
  const { data: existing } = await service
    .from("jp_tickets")
    .select("id, status")
    .eq("session_date", date)
    .eq("member_id", memberId)
    .eq("fining_officer", officer)
    .maybeSingle();

  // One ticket per brother per fining officer per night, whatever contact he gives.
  // Only a cancelled ticket can be replaced.
  const duplicate = `You already have a ticket for ${officer}. Ask the JP Chair if you lost the link.`;
  if (existing && existing.status !== "cancelled") {
    return NextResponse.json({ error: duplicate }, { status: 409 });
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
    fining_officer: officer,
    ticket_no: ticketNo,
    phone,
    snapchat,
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
    // Unique (session_date, member_id, fining_officer): a double-tap raced us.
    if (error.code === "23505") return NextResponse.json({ error: duplicate }, { status: 409 });
    return NextResponse.json({ error: "Couldn't create the ticket. Try again." }, { status: 500 });
  }

  return NextResponse.json({ token, ticketNo }, { headers: { "Cache-Control": "no-store" } });
}
