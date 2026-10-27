import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { hashTicketToken } from "@/lib/jp-docket";
import { TICKET_REPLIES } from "@/lib/jp-info";

// POST /api/jp-ticket/[token]/reply — { reply: "on_my_way" | "need_5" } after the chair
// calls him, so the chair knows he's coming before skipping anyone.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const { reply } = await req.json().catch(() => ({}));
  if (!TICKET_REPLIES.includes(reply)) return NextResponse.json({ error: "Unknown reply" }, { status: 400 });

  const service = createServiceClient();
  const { data: ticket } = await service
    .from("jp_tickets")
    .select("id, status")
    .eq("token_hash", hashTicketToken(token))
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.status !== "called") {
    return NextResponse.json({ error: "You can reply once the JP Chair calls you." }, { status: 409 });
  }

  const { error } = await service
    .from("jp_tickets")
    .update({ reply, replied_at: new Date().toISOString() })
    .eq("id", ticket.id);
  if (error) return NextResponse.json({ error: "Couldn't send. Try again." }, { status: 500 });
  return NextResponse.json({ success: true });
}
