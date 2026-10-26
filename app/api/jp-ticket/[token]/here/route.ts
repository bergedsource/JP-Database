import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { hashTicketToken, markHere } from "@/lib/jp-docket";

// POST /api/jp-ticket/[token]/here — the brother says he's at JP. If he'd been
// skipped, he goes back to his roll # spot, or to the end of his officer group if
// JP has already passed it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const service = createServiceClient();
  const { data: ticket } = await service
    .from("jp_tickets")
    .select("id, member_id, status")
    .eq("token_hash", hashTicketToken(token))
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.status === "cancelled" || ticket.status === "done") {
    return NextResponse.json({ error: "This ticket is closed." }, { status: 409 });
  }

  const err = await markHere(service, ticket.member_id, ticket.id);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  return NextResponse.json({ success: true });
}
