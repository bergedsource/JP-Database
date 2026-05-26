import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { gameDisabledResponse } from "@/lib/game-gate";
import { consumeGameSession } from "@/lib/game-session";
import { NextRequest, NextResponse } from "next/server";
import { MAX_POSSIBLE_SCORE } from "@/lib/game-constants";

const USERNAME_PATTERN = /^[A-Za-z0-9 ]{1,16}$/;
// Wall-clock tolerance for client/server clock skew + network latency.
const WALL_CLOCK_TOLERANCE_SEC = 5;

export async function POST(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await gameDisabledResponse();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const score = body.score;
  const time_seconds = body.time_seconds;
  const sessionToken = typeof body.session_token === "string" ? body.session_token : "";

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: "Invalid username (1-16 chars, letters/digits/spaces only)" }, { status: 400 });
  }
  if (!Number.isInteger(score) || score < 0 || score > MAX_POSSIBLE_SCORE) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }
  if (!Number.isInteger(time_seconds) || time_seconds < 0) {
    return NextResponse.json({ error: "Invalid time_seconds" }, { status: 400 });
  }
  // Sanity floor: minimum 0.5 sec per point earned. Rejects the laziest cheats.
  if (time_seconds < score * 0.5) {
    return NextResponse.json({ error: "Time too short for score (anti-cheat)" }, { status: 400 });
  }
  if (!sessionToken) {
    return NextResponse.json({ error: "Missing session token" }, { status: 400 });
  }

  // Atomic consume: only one /score per /start. Replays and concurrent double-submits
  // both fail here because the second call sees null.
  const session = await consumeGameSession(sessionToken);
  if (!session) {
    return NextResponse.json(
      { error: "Session expired or already used. Start a new game." },
      { status: 400 },
    );
  }

  // Submitted score cannot exceed what the actual question set permits.
  if (score > session.maxPossibleScore) {
    return NextResponse.json({ error: "Score exceeds question-set maximum (anti-cheat)" }, { status: 400 });
  }

  // Wall-clock alignment: submitted time can't exceed actual elapsed wall-clock
  // (plus tolerance). Catches "claim 1000s of play in 5s of real time."
  const wallClockElapsedSec = (Date.now() - session.startedAt) / 1000;
  if (time_seconds > wallClockElapsedSec + WALL_CLOCK_TOLERANCE_SEC) {
    return NextResponse.json({ error: "Time exceeds elapsed wall-clock (anti-cheat)" }, { status: 400 });
  }

  // Trap-trivia flag: count how many trivia questions the player got wrong.
  // The client submits trivia_answers; we validate each against the session-stored
  // {id, correctIndex} pairs. Wrong/missing answers count toward the suspect flag.
  // Defensive: if client omits trivia_answers entirely but the session had traps,
  // treat ALL traps as wrong (a cheater might strip the field to avoid the flag).
  const submittedTrivia: Array<{ id: unknown; picked: unknown }> = Array.isArray(body.trivia_answers)
    ? body.trivia_answers
    : [];
  let trapWrongCount = 0;
  for (const trap of session.trivia) {
    const submission = submittedTrivia.find((a) => a.id === trap.id);
    if (!submission || submission.picked !== trap.correctIndex) {
      trapWrongCount += 1;
    }
  }
  const flagged_suspect = trapWrongCount > 0 && session.trivia.length > 0;

  const service = createServiceClient();

  // Insert
  const { data: inserted, error: insertErr } = await service
    .from("game_leaderboard")
    .insert({ username, score, time_seconds, flagged_suspect })
    .select("id")
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Compute rank: count entries that strictly beat this one
  const { count, error: rankErr } = await service
    .from("game_leaderboard")
    .select("*", { count: "exact", head: true })
    // Safe template-string interpolation: both values validated as integers via Number.isInteger above.
    .or(`score.gt.${score},and(score.eq.${score},time_seconds.lt.${time_seconds})`);
  if (rankErr) {
    // Non-fatal — the entry is recorded, we just can't compute rank
    return NextResponse.json({ id: inserted.id, rank: null });
  }

  // Flagged-suspect runs never get a public rank (they're excluded from the public top-3 leaderboard).
  // Returning null rank also avoids tipping the cheater off that they were caught.
  if (flagged_suspect) {
    return NextResponse.json({ id: inserted.id, rank: null });
  }

  const rank = (count ?? 0) + 1;
  return NextResponse.json({ id: inserted.id, rank: rank <= 3 ? rank : null });
}
