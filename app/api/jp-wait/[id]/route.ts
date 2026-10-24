import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import {
  HEARING_MINUTES_KEY,
  brotherMinutes,
  parseHearingMinutes,
  type JpWait,
} from "@/lib/jp-info";

// GET /api/jp-wait/[id] — estimate when a brother will be called at the next JP
// session. The docket is every brother with a pending fine, called lowest roll #
// first. Only counts and minutes come back — never who else is on the docket.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing member id" }, { status: 400 });

  const service = createServiceClient();
  const [pendingRes, membersRes, settingsRes] = await Promise.all([
    service.from("public_member_fines").select("member_id, fine_type").eq("status", "pending"),
    service.from("public_members").select("id, roll"),
    service.from("public_settings").select("key, value").eq("key", HEARING_MINUTES_KEY),
  ]);
  if (pendingRes.error || membersRes.error) {
    return NextResponse.json({ error: "Failed to load docket" }, { status: 500 });
  }

  const minutes = parseHearingMinutes(settingsRes.data?.[0]?.value);
  const rollOf = new Map((membersRes.data ?? []).map((m) => [m.id as string, (m.roll as number | null) ?? null]));

  const finesByMember = new Map<string, string[]>();
  for (const f of pendingRes.data ?? []) {
    const list = finesByMember.get(f.member_id) ?? [];
    list.push(f.fine_type);
    finesByMember.set(f.member_id, list);
  }

  // Calling order: roll # low to high; brothers without a roll (or not on the public
  // roster) go last, in a stable order.
  const docket = [...finesByMember.entries()]
    .map(([memberId, fines]) => ({ memberId, fines, roll: rollOf.get(memberId) ?? null }))
    .sort((a, b) => {
      if (a.roll === b.roll) return a.memberId.localeCompare(b.memberId);
      if (a.roll === null) return 1;
      if (b.roll === null) return -1;
      return a.roll - b.roll;
    });

  const index = docket.findIndex((d) => d.memberId === id);
  const headers = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };
  if (index === -1) return NextResponse.json({ onDocket: false } satisfies JpWait, { headers });

  const queue = docket.map((d) => brotherMinutes(d.fines, minutes));
  const ahead = docket.slice(0, index);
  const own = docket[index];
  const counts = new Map<string, number>();
  for (const t of own.fines) counts.set(t, (counts.get(t) ?? 0) + 1);

  const body: JpWait = {
    onDocket: true,
    place: index + 1,
    docketSize: docket.length,
    brothersAhead: ahead.length,
    finesAhead: ahead.reduce((n, d) => n + d.fines.length, 0),
    minutesAhead: queue.slice(0, index).reduce((n, m) => n + m, 0),
    ownMinutes: queue[index],
    ownFines: [...counts.entries()].map(([fineType, count]) => ({ fineType, count })),
    queue,
    queueIndex: index,
  };
  return NextResponse.json(body, { headers });
}
