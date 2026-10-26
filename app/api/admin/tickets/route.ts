import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { formatPhone, type TicketStatus } from "@/lib/jp-info";
import { loadDocket } from "@/lib/jp-docket";

export type TicketSoFar = {
  no: number | null;
  name: string;
  roll: number | null;
  officer: string;
  status: TicketStatus;
  contact: string; // formatted phone or "via Snapchat"
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
    .select("member_id, fining_officer, ticket_no, status, phone, snapchat, proxy_name, created_at")
    .eq("session_date", docket.ticketDate)
    .not("fining_officer", "is", null)
    .neq("status", "cancelled")
    .order("ticket_no", { ascending: true });

  const tickets: TicketSoFar[] = (data ?? []).map((t) => {
    const m = docket.members.get(t.member_id as string);
    return {
      no: (t.ticket_no as number | null) ?? null,
      name: m?.name ?? "Unknown",
      roll: m?.roll ?? null,
      officer: t.fining_officer as string,
      status: t.status as TicketStatus,
      contact: t.phone ? formatPhone(t.phone as string) : t.snapchat != null ? "via Snapchat" : "",
      proxyName: (t.proxy_name as string | null) ?? null,
      takenAt: t.created_at as string,
    };
  });
  return NextResponse.json({ date: docket.ticketDate, tickets } satisfies TicketsSoFarResponse, { headers: { "Cache-Control": "no-store" } });
}
