import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { gameDisabledResponse } from "@/lib/game-gate";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await gameDisabledResponse();
  if (denied) return denied;

  // Reads the curated `public_game_leaderboard` view (see migration_public_read_
  // views.sql), which pre-filters flagged entries and exposes only these columns.
  const service = createServiceClient();
  const { data, error } = await service
    .from("public_game_leaderboard")
    .select("id, username, score, time_seconds, created_at")
    .order("score", { ascending: false })
    .order("time_seconds", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { entries: data ?? [] },
    {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
    },
  );
}
