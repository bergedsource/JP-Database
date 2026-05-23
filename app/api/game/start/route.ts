import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import type { GameQuestion, GameStartResponse } from "@/lib/types";

const QUESTIONS_PER_GAME = 25;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const y = parseInt(iso.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export async function GET(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const service = createServiceClient();

  // Gate on game_enabled
  const { data: gameEnabled } = await service
    .from("settings")
    .select("value")
    .eq("key", "game_enabled")
    .maybeSingle();
  if (gameEnabled?.value !== "true") {
    return NextResponse.json({ error: "Game is not currently enabled" }, { status: 403 });
  }

  // Active members only (Dillon's direction, deviation from spec line 167). Big bros are pulled from
  // chapter_roster regardless of current status — only the question SUBJECT must be active.
  const { data: members, error: mErr } = await service
    .from("members")
    .select("name, roll")
    .eq("status", "active")
    .not("roll", "is", null);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No eligible members for trivia" }, { status: 500 });
  }

  // Pull the full roster once (small table, ~1400 rows; cheaper than per-question lookups)
  const { data: roster, error: rErr } = await service
    .from("chapter_roster")
    .select("roll, name, initiation_date, big_brother_roll");
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!roster || roster.length === 0) {
    return NextResponse.json({ error: "Roster is empty" }, { status: 500 });
  }

  const rosterByRoll = new Map(roster.map((r) => [r.roll, r]));

  // Build question pool: for each member, build up to 2 questions (bigbro if known, roll # always since we filtered NOT NULL)
  const pool: GameQuestion[] = [];

  for (const m of members) {
    if (m.roll == null) continue;

    // Roll-# question — always possible (member has a roll)
    pool.push({
      member_name: m.name,
      type: "roll",
      correct_answer: m.roll,
    });

    // Bigbro question — only if the roster knows their big bro AND the big bro is itself a roster row we can name
    const rosterRow = rosterByRoll.get(m.roll);
    if (rosterRow?.big_brother_roll != null) {
      const bigBro = rosterByRoll.get(rosterRow.big_brother_roll);
      if (bigBro?.name) {
        const targetYear = yearOf(rosterRow.initiation_date);

        // Distractor pool: era-matched within ±5 years
        const eraMatched = (radiusYears: number) => {
          if (targetYear == null) return [];
          return roster.filter((r) => {
            if (r.roll === bigBro.roll) return false;
            const ry = yearOf(r.initiation_date);
            return ry != null && Math.abs(ry - targetYear) <= radiusYears;
          });
        };

        let distractorCandidates = eraMatched(5);
        if (distractorCandidates.length < 3) distractorCandidates = eraMatched(10);
        if (distractorCandidates.length < 3) {
          // Any roster row with a non-null name, excluding the correct answer
          distractorCandidates = roster.filter((r) => r.roll !== bigBro.roll && r.name);
        }

        const distractors = shuffle(distractorCandidates).slice(0, 3).map((r) => ({
          roll: r.roll,
          name: r.name,
        }));

        // Pad with synthetic placeholders if still short (catastrophic — roster has <4 rows)
        while (distractors.length < 3) {
          distractors.push({ roll: -1 - distractors.length, name: `Unknown #${-1 - distractors.length}` });
        }

        const options = shuffle([
          { roll: bigBro.roll, name: bigBro.name },
          ...distractors,
        ]);

        pool.push({
          member_name: m.name,
          type: "bigbro",
          options,
          correct_answer: bigBro.roll,
        });
      }
    }
  }

  if (pool.length === 0) {
    return NextResponse.json({ error: "No questions could be built from the current data" }, { status: 500 });
  }

  const questions = shuffle(pool).slice(0, QUESTIONS_PER_GAME);
  const response: GameStartResponse = { questions };

  return NextResponse.json(response);
}
