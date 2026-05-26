import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { gameDisabledResponse } from "@/lib/game-gate";
import { getCurrentRole } from "@/lib/admin-auth";
import { createGameSession } from "@/lib/game-session";
import { BIGBRO_POINTS, ROLL_POINTS, TRIVIA_POINTS } from "@/lib/game-constants";
import { NextRequest, NextResponse } from "next/server";
import type { GameQuestion, GameStartResponse } from "@/lib/types";

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
  const y = parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export async function GET(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await gameDisabledResponse();
  if (denied) return denied;

  const service = createServiceClient();

  // Any member with a roll # is fair game — active, alumni, inactive, live-out, resident-advisor.
  // Pledges naturally drop out because they don't have rolls until initiation.
  const { data: members, error: mErr } = await service
    .from("members")
    .select("name, roll")
    .not("roll", "is", null);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No eligible members for trivia" }, { status: 500 });
  }

  // Pull the full roster once (small table, ~1400 rows; cheaper than per-question lookups).
  // Supabase caps each response at 1000 rows server-side regardless of .limit() — paginate via .range().
  const PAGE = 1000;
  const roster: Array<{ roll: number; name: string; initiation_date: string | null; big_brother_roll: number | null }> = [];
  let from = 0;
  while (true) {
    const { data, error: rErr } = await service
      .from("chapter_roster")
      .select("roll, name, initiation_date, big_brother_roll")
      .range(from, from + PAGE - 1)
      .order("roll", { ascending: true });
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    if (!data || data.length === 0) break;
    roster.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (roster.length === 0) {
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

        // Eligible distractor: not the correct big bro, not the little brother themselves,
        // joined before or with the little brother (rolls are sequential by initiation, so
        // r.roll <= m.roll means "could plausibly be m's big bro"), and has a name.
        const isEligibleDistractor = (r: { roll: number; name: string }) =>
          r.roll !== bigBro.roll &&
          r.roll !== m.roll &&
          r.roll <= m.roll &&
          !!r.name;

        // Distractor pool: era-matched within ±5 years
        const eraMatched = (radiusYears: number) => {
          if (targetYear == null) return [];
          return roster.filter((r) => {
            if (!isEligibleDistractor(r)) return false;
            const ry = yearOf(r.initiation_date);
            return ry != null && Math.abs(ry - targetYear) <= radiusYears;
          });
        };

        let distractorCandidates = eraMatched(5);
        if (distractorCandidates.length < 3) distractorCandidates = eraMatched(10);
        if (distractorCandidates.length < 3) {
          distractorCandidates = roster.filter(isEligibleDistractor);
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

  // Trivia injection: include every chapter_trivia row in every game (shuffled).
  // Game length is bounded by STARTING_LIVES, not pool size — players who survive long
  // enough see more variety, but most won't finish the full pool. Future-proof: growing
  // the trivia table automatically scales without code changes.
  const { data: triviaRows } = await service
    .from("chapter_trivia")
    .select("id, question_text, option_a, option_b, option_c, option_d, correct_index");
  const selectedTrivia = shuffle(triviaRows ?? []);

  for (const t of selectedTrivia) {
    pool.push({
      member_name: t.question_text,
      type: "trivia",
      // Shuffle so the correct answer isn't always in the same visual position.
      // Each option's `roll` (0-3) preserves its original A/B/C/D index, so
      // `correct_answer` matching still works regardless of display order.
      options: shuffle([
        { roll: 0, name: t.option_a },
        { roll: 1, name: t.option_b },
        { roll: 2, name: t.option_c },
        { roll: 3, name: t.option_d },
      ]),
      correct_answer: t.correct_index,
      trivia_id: t.id,
    });
  }

  // Full pool — every member's every applicable question + trivia traps, randomized order.
  const questions = shuffle(pool);

  // Per-question-set score ceiling: 1pt per bigbro + 2pt per roll + 3pt per trivia.
  // /score validates against THIS rather than the global MAX_POSSIBLE_SCORE so a cheater can't
  // submit a score higher than the pool actually permits.
  const maxPossibleScore = questions.reduce(
    (sum, q) =>
      sum +
      (q.type === "bigbro" ? BIGBRO_POINTS : q.type === "roll" ? ROLL_POINTS : TRIVIA_POINTS),
    0,
  );

  // Creator-only test mode: infinite lives + timer bypass on the client.
  // getCurrentRole returns null for unauthenticated callers — fast path, no role table lookup.
  const current = await getCurrentRole();
  const is_creator = current?.role === "root";

  // Issue a one-shot session token bound to this question set. /score consumes it
  // to prove the player went through /start (blocks doctored POSTs to /score).
  const triviaForSession = selectedTrivia.map((t) => ({ id: t.id, correctIndex: t.correct_index }));
  const session_token = await createGameSession(getIP(req), maxPossibleScore, triviaForSession);

  const response: GameStartResponse = { questions, is_creator, session_token };

  return NextResponse.json(response);
}
