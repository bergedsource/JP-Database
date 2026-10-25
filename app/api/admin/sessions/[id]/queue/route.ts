import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { formatPhone, type TicketStatus } from "@/lib/jp-info";
import { loadDocket, markHere, markSkipped, nowHearing } from "@/lib/jp-docket";

export type QueueRow = {
  memberId: string;
  officer: string;
  name: string;
  roll: number | null;
  fines: number;
  isNow: boolean;
  requeued: boolean;
  ticket: { no: number | null; status: TicketStatus; phone: string | null; phoneDisplay: string | null; snapchat: string | null; proxyName: string | null } | null;
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
    .select("member_id, fining_officer, ticket_no, status, phone, snapchat, requeued, proxy_name")
    .eq("session_date", session.date_held);
  // A brother's ticket for each officer group, plus his chair row (skip/here, no officer).
  const tickets = new Map(
    (ticketRows ?? []).filter((t) => t.fining_officer && t.status !== "cancelled").map((t) => [`${t.member_id}|${t.fining_officer}`, t])
  );
  const chairRows = new Map((ticketRows ?? []).filter((t) => !t.fining_officer).map((t) => [t.member_id as string, t]));
  const requeuedMembers = new Set((ticketRows ?? []).filter((t) => t.requeued).map((t) => t.member_id as string));

  const now = nowHearing(docket);
  const groups: QueueGroup[] = [];
  for (const slot of docket.slots) {
    let g = groups[groups.length - 1];
    if (!g || g.officer !== slot.officer) {
      g = { officer: slot.officer, brothers: 0, fines: 0, rows: [] };
      groups.push(g);
    }
    const m = docket.members.get(slot.memberId);
    const t = tickets.get(`${slot.memberId}|${slot.officer}`);
    const chair = chairRows.get(slot.memberId);
    const skipped = docket.skipped.has(slot.memberId);
    g.brothers += 1;
    g.fines += slot.fines.length;
    g.rows.push({
      memberId: slot.memberId,
      officer: slot.officer,
      name: m?.name ?? "Unknown",
      roll: m?.roll ?? null,
      fines: slot.fines.length,
      isNow: slot === now,
      requeued: requeuedMembers.has(slot.memberId),
      ticket: t
        ? { no: t.ticket_no, status: (skipped ? "skipped" : t.status) as TicketStatus, phone: t.phone, phoneDisplay: t.phone ? formatPhone(t.phone) : null, snapchat: t.snapchat ?? null, proxyName: t.proxy_name ?? null }
        : chair
          ? { no: null, status: chair.status as TicketStatus, phone: null, phoneDisplay: null, snapchat: null, proxyName: null }
          : null,
    });
  }

  const live = (ticketRows ?? []).filter((t) => t.status !== "cancelled" && t.fining_officer && (t.phone || t.snapchat != null));
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
  const { action, member_id: memberIdIn, officer: officerIn } = await req.json().catch(() => ({}));
  const { service, session } = await sessionGuard(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at) return NextResponse.json({ error: "This session is closed." }, { status: 409 });
  const date = session.date_held as string;

  let memberId: string | null = typeof memberIdIn === "string" ? memberIdIn : null;
  let officer: string | null = typeof officerIn === "string" ? officerIn : null;

  if (action === "call-next") {
    const docket = await loadDocket(service);
    const { data: rows } = await service.from("jp_tickets").select("member_id, fining_officer, status, phone, snapchat").eq("session_date", date);
    const waiting = new Set(
      (rows ?? []).filter((t) => t.status === "waiting" && t.fining_officer && (t.phone || t.snapchat != null)).map((t) => `${t.member_id}|${t.fining_officer}`)
    );
    const start = Math.max(0, docket.slots.findIndex((s) => !docket.skipped.has(s.memberId)));
    const next = docket.slots.slice(start).find((s) => !docket.skipped.has(s.memberId) && waiting.has(`${s.memberId}|${s.officer}`));
    if (!next) return NextResponse.json({ error: "Nobody with a ticket is waiting." }, { status: 409 });
    memberId = next.memberId;
    officer = next.officer;
  }
  if (!memberId) return NextResponse.json({ error: "Missing member" }, { status: 400 });

  let error: string | null = null;
  if (action === "here") {
    error = await markHere(service, memberId);
  } else if (action === "skip") {
    error = await markSkipped(service, date, memberId);
  } else if (action === "call-next" || action === "call" || action === "waiting") {
    // Calling is per ticket: one officer group's ticket for this brother.
    if (!officer) return NextResponse.json({ error: "Missing officer" }, { status: 400 });
    const patch: Record<string, unknown> = { status: action === "waiting" ? "waiting" : "called" };
    if (patch.status === "called") patch.called_at = new Date().toISOString();
    const res = await service.from("jp_tickets").update(patch).eq("session_date", date).eq("member_id", memberId).eq("fining_officer", officer);
    if (res.error) error = "Couldn't update. Try again.";
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (error) return NextResponse.json({ error }, { status: 500 });

  const { data: member } = await service.from("members").select("name").eq("id", memberId).maybeSingle();
  await service.from(current.role === "root" ? "system_events" : "audit_logs").insert({
    admin_email: current.email,
    action: "JP Queue",
    details: `${member?.name ?? "Unknown"}${officer ? ` (${officer})` : ""}: ${action} (session ${date})`,
  });

  return NextResponse.json({ success: true, member_id: memberId, officer });
}
