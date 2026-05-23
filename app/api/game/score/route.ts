import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const USERNAME_PATTERN = /^[A-Za-z0-9 ]{1,16}$/;
const MAX_QUESTIONS_PER_GAME = 25;
const MAX_POINTS_PER_QUESTION = 2;
const SCORE_CAP = MAX_QUESTIONS_PER_GAME * MAX_POINTS_PER_QUESTION;

export async function POST(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const score = body.score;
  const time_seconds = body.time_seconds;

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Invalid username (1-16 chars, letters/digits/spaces only)" }, { status: 400 });
  }
  if (!Number.isInteger(score) || score < 0 || score > SCORE_CAP) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }
  if (!Number.isInteger(time_seconds) || time_seconds < 0) {
    return NextResponse.json({ error: "Invalid time_seconds" }, { status: 400 });
  }
  // Sanity floor: minimum 0.5 sec per point earned. Rejects the laziest cheats.
  if (time_seconds < score * 0.5) {
    return NextResponse.json({ error: "Time too short for score (anti-cheat)" }, { status: 400 });
  }

  const service = createServiceClient();

  // Insert
  const { data: inserted, error: insertErr } = await service
    .from("game_leaderboard")
    .insert({ username, score, time_seconds })
    .select("id")
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Compute rank: count entries that strictly beat this one
  const { count, error: rankErr } = await service
    .from("game_leaderboard")
    .select("*", { count: "exact", head: true })
    .or(`score.gt.${score},and(score.eq.${score},time_seconds.lt.${time_seconds})`);
  if (rankErr) {
    // Non-fatal — the entry is recorded, we just can't compute rank
    return NextResponse.json({ id: inserted.id, rank: null });
  }

  const rank = (count ?? 0) + 1;
  return NextResponse.json({ id: inserted.id, rank: rank <= 3 ? rank : null });
}
