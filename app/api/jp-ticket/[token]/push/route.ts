import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { hashTicketToken } from "@/lib/jp-docket";

// POST /api/jp-ticket/[token]/push — save this device's push subscription for the
// ticket, so it gets "almost up" and "you're being called" alerts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  // Push services are https endpoints; refuse anything else (it's fetched server-side).
  if (!endpoint.startsWith("https://") || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: ticket } = await service
    .from("jp_tickets")
    .select("id, status")
    .eq("token_hash", hashTicketToken(token))
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.status === "cancelled" || ticket.status === "done") {
    return NextResponse.json({ error: "This ticket is closed." }, { status: 409 });
  }

  const { error } = await service
    .from("jp_push_subscriptions")
    .upsert({ ticket_id: ticket.id, endpoint, p256dh, auth }, { onConflict: "ticket_id,endpoint" });
  if (error) return NextResponse.json({ error: "Couldn't turn on alerts. Try again." }, { status: 500 });
  return NextResponse.json({ success: true });
}
