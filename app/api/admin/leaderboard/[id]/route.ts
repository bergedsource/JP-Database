import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const service = createServiceClient();

  const { data: entry } = await service
    .from("game_leaderboard")
    .select("username, score, flagged_suspect")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  if (!entry.flagged_suspect) return NextResponse.json({ error: "Entry is not flagged" }, { status: 400 });

  const { error } = await service
    .from("game_leaderboard")
    .update({ flagged_suspect: false })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Approved Leaderboard Entry",
    details: `Cleared flag for ${entry.username} (${entry.score} pts) — pushed to live leaderboard`,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const service = createServiceClient();

  const { data: entry } = await service
    .from("game_leaderboard")
    .select("username, score")
    .eq("id", id)
    .maybeSingle();
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const { error } = await service.from("game_leaderboard").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Deleted Leaderboard Entry",
    details: `Removed ${entry.username} (${entry.score} pts)`,
  });

  return NextResponse.json({ success: true });
}
