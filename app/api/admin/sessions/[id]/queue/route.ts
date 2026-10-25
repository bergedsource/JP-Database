import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { formatPhone, type TicketStatus } from "@/lib/jp-info";
import { loadDocket, markHere, nowHearing } from "@/lib/jp-docket";

export type QueueRow = {
  memberId: string;
  name: string;
  roll: number | null;
  fines: number;
  isNow: boolean;
  requeued: boolean;
  ticket: { no: number | null; status: TicketStatus; phone: string | null; phoneDisplay: string | null } | null;
};
export type QueueGroup = { officer: string; brothers: number; fines: number; rows: QueueRow[] };
export type QueueResponse = {
  open: boolean;
  nowHearing: { name: string; roll: number | null; officer: string } | null;
  groups: QueueGroup[];
  counts: { tickets: number; waiting: number; here: number; called: number; skipped: number };
};

async function sessionGuard(id: string) {
  const service = createServiceClient();
  const { data: session } = await service.from("jp_sessions").select("id, date_held, closed_at").eq("id", id).maybeSingle();
  return { service, session };
}

// GET /api/admin/sessions/[id]/queue — the docket in hearing order (officer groups,
// then roll #) with each brother's ticket. Owner/root only: includes phone numbers.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const { service, session } = await sessionGuard(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at) {
    return NextResponse.json({ open: false, nowHearing: null, groups: [], counts: { tickets: 0, waiting: 0, here: 0, called: 0, skipped: 0 } } satisfies QueueResponse);
  }

  const docket = await loadDocket(service);
  const { data: ticketRows } = await service
    .from("jp_tickets")
    .select("member_id, ticket_no, status, phone, requeued")
    .eq("session_date", session.date_held);
  const tickets = new Map((ticketRows ?? []).map((t) => [t.member_id as string, t]));

  const now = nowHearing(docket);
  const groups: QueueGroup[] = [];
  for (const slot of docket.slots) {
    let g = groups[groups.length - 1];
    if (!g || g.officer !== slot.officer) {
      g = { officer: slot.officer, brothers: 0, fines: 0, rows: [] };
      groups.push(g);
    }
    const m = docket.members.get(slot.memberId);
    const t = tickets.get(slot.memberId);
    g.brothers += 1;
    g.fines += slot.fines.length;
    g.rows.push({
      memberId: slot.memberId,
      name: m?.name ?? "Unknown",
      roll: m?.roll ?? null,
      fines: slot.fines.length,
      isNow: slot === now,
      requeued: !!t?.requeued,
      ticket: t && t.status !== "cancelled"
        ? { no: t.ticket_no, status: t.status as TicketStatus, phone: t.phone, phoneDisplay: t.phone ? formatPhone(t.phone) : null }
        : null,
    });
  }

  const live = (ticketRows ?? []).filter((t) => t.status !== "cancelled" && t.phone);
  const body: QueueResponse = {
    open: true,
    nowHearing: now ? { name: docket.members.get(now.memberId)?.name ?? "Unknown", roll: docket.members.get(now.memberId)?.roll ?? null, officer: now.officer } : null,
    groups,
    counts: {
      tickets: live.length,
      waiting: live.filter((t) => t.status === "waiting").length,
      here: (ticketRows ?? []).filter((t) => t.status === "here").length,
      called: live.filter((t) => t.status === "called").length,
      skipped: (ticketRows ?? []).filter((t) => t.status === "skipped").length,
    },
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/admin/sessions/[id]/queue — { action, member_id? }
//   call-next: mark the next waiting ticket holder (from whoever's up now) as called
//   call | skip | here | waiting: set one brother's state
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const denied = await requireOwner();
  if (denied) return denied;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action, member_id: memberIdIn } = await req.json().catch(() => ({}));
  const { service, session } = await sessionGuard(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at) return NextResponse.json({ error: "This session is closed." }, { status: 409 });
  const date = session.date_held as string;

  let memberId: string | null = typeof memberIdIn === "string" ? memberIdIn : null;

  if (action === "call-next") {
    const docket = await loadDocket(service);
    const { data: rows } = await service.from("jp_tickets").select("member_id, status, phone").eq("session_date", date);
    const waiting = new Set((rows ?? []).filter((t) => t.status === "waiting" && t.phone).map((t) => t.member_id as string));
    const start = Math.max(0, docket.slots.findIndex((s) => !docket.skipped.has(s.memberId)));
    const next = docket.slots.slice(start).find((s) => waiting.has(s.memberId));
    if (!next) return NextResponse.json({ error: "Nobody with a ticket is waiting." }, { status: 409 });
    memberId = next.memberId;
  }
  if (!memberId) return NextResponse.json({ error: "Missing member" }, { status: 400 });

  let error: string | null = null;
  if (action === "here") {
    error = await markHere(service, memberId);
  } else if (action === "call-next" || action === "call" || action === "skip" || action === "waiting") {
    const status = action === "skip" ? "skipped" : action === "waiting" ? "waiting" : "called";
    const patch: Record<string, unknown> = { status };
    if (status === "called") patch.called_at = new Date().toISOString();
    const { data: existing } = await service.from("jp_tickets").select("id").eq("session_date", date).eq("member_id", memberId).maybeSingle();
    const res = existing
      ? await service.from("jp_tickets").update(patch).eq("id", existing.id)
      : await service.from("jp_tickets").insert({ session_date: date, member_id: memberId, source: "chair", ...patch });
    if (res.error) error = "Couldn't update. Try again.";
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (error) return NextResponse.json({ error }, { status: 500 });

  const { data: member } = await service.from("members").select("name").eq("id", memberId).maybeSingle();
  await service.from(current.role === "root" ? "system_events" : "audit_logs").insert({
    admin_email: current.email,
    action: "JP Queue",
    details: `${member?.name ?? "Unknown"}: ${action} (session ${date})`,
  });

  return NextResponse.json({ success: true, member_id: memberId });
}
