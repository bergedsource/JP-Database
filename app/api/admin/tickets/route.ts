import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { formatPhone, type TicketStatus } from "@/lib/jp-info";
import { loadDocket } from "@/lib/jp-docket";

export type TicketSoFar = {
  id: string;
  no: number | null;
  name: string;
  roll: number | null;
  officer: string;
  status: TicketStatus;
  contact: string; // formatted phone or "via Snapchat"
  phone: string | null; // +1XXXXXXXXXX for tap-to-call / text
  proxyName: string | null;
  takenAt: string;
};
export type TicketsSoFarResponse = { date: string | null; tickets: TicketSoFar[] };

// GET /api/admin/tickets — tickets taken for the upcoming (or running) JP night, so
// the chair can see them before starting the session. Owner/root only: has phones.
export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  const service = createServiceClient();
  const docket = await loadDocket(service);
  if (!docket.ticketDate) return NextResponse.json({ date: null, tickets: [] } satisfies TicketsSoFarResponse);

  const { data } = await service
    .from("jp_tickets")
    .select("id, member_id, fining_officer, ticket_no, status, phone, snapchat, proxy_name, created_at")
    .eq("session_date", docket.ticketDate)
    .not("fining_officer", "is", null)
    .neq("status", "cancelled")
    .order("ticket_no", { ascending: true });

  const tickets: TicketSoFar[] = (data ?? []).map((t) => {
    const m = docket.members.get(t.member_id as string);
    return {
      id: t.id as string,
      no: (t.ticket_no as number | null) ?? null,
      name: m?.name ?? "Unknown",
      roll: m?.roll ?? null,
      officer: t.fining_officer as string,
      status: t.status as TicketStatus,
      contact: t.phone ? formatPhone(t.phone as string) : t.snapchat != null ? "via Snapchat" : "",
      phone: (t.phone as string | null) ?? null,
      proxyName: (t.proxy_name as string | null) ?? null,
      takenAt: t.created_at as string,
    };
  });
  return NextResponse.json({ date: docket.ticketDate, tickets } satisfies TicketsSoFarResponse, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/admin/tickets — { id } cancels one ticket before (or during) the night:
// clears its contact and link so the brother can take a new one. Owner/root only.
export async function POST(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const denied = await requireOwner();
  if (denied) return denied;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Missing ticket" }, { status: 400 });

  const service = createServiceClient();
  const { data: ticket } = await service
    .from("jp_tickets")
    .select("member_id, fining_officer, session_date, ticket_no, status")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.status === "cancelled") return NextResponse.json({ success: true });

  const { error } = await service
    .from("jp_tickets")
    .update({ status: "cancelled", phone: null, snapchat: null, proxy_name: null, token_hash: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't cancel. Try again." }, { status: 500 });

  const { data: member } = await service.from("members").select("name").eq("id", ticket.member_id).maybeSingle();
  await service.from(current.role === "root" ? "system_events" : "audit_logs").insert({
    admin_email: current.email,
    action: "Cancelled JP Ticket",
    details: `${member?.name ?? "Unknown"} — ticket #${ticket.ticket_no ?? "?"} for ${ticket.fining_officer} (${ticket.session_date})`,
  });
  return NextResponse.json({ success: true });
}
