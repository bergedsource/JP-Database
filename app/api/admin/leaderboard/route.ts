import { getCurrentRole, requireAuth, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("game_leaderboard")
    .select("id, username, score, time_seconds, created_at")
    .order("score", { ascending: false })
    .order("time_seconds", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(3);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  const { count: priorCount } = await service
    .from("game_leaderboard")
    .select("*", { count: "exact", head: true });

  const { error } = await service.from("game_leaderboard").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Cleared Game Leaderboard",
    details: `Deleted ${priorCount ?? 0} leaderboard entries`,
  });

  return NextResponse.json({ success: true, deleted: priorCount ?? 0 });
}
