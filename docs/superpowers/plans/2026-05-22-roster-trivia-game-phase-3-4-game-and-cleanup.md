# Chapter Trivia Game — Phase 3+4: Game UI, Public APIs, and Leaderboard Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public-facing Chapter Trivia Game (`/game`) plus the admin leaderboard cleanup tools, combining spec Phases 3 and 4 into one shipping unit.

**Architecture:**
- One new table (`game_leaderboard`) + one new settings row (`game_enabled` kill switch)
- Three public game APIs (`/api/game/start|score|leaderboard`)
- Two admin cleanup APIs (`DELETE /api/admin/leaderboard` + `[id]`)
- One new page (`/game`) — single client component, three view states (start/playing/over)
- Home page additions (play button + inline top-3)
- Admin TransitionTab additions (leaderboard cleanup section + `game_enabled` toggle)

Client-side game scoring with sanity-floor anti-cheat (acknowledged as v1 trade-off per spec §Anti-Cheat). The leaderboard table is admin-clearable, which is the real cheat-recovery mechanism.

**Tech Stack:** Next.js 16 App Router (TypeScript), Supabase service-client for all server-side DB writes, `@upstash/ratelimit` (existing `publicLimiter` for game endpoints, `adminLimiter` for cleanup), reuses existing `adm-*` CSS classes where appropriate but the game page gets its own bespoke styles.

---

## Assumptions Baked Into This Plan (Override Before Execution If Needed)

These are decisions I made because the spec left them open. Edit this plan before running execution to override:

| Decision | Default | Why |
|---|---|---|
| Questions per game | **25** | Matches the Pearson MyLab quiz length feel; long enough to be a real challenge, short enough to be played in ~5 min |
| Member pool for questions | **`status = 'active'` only** | Per Dillon: questions should be about current active members. Pledges/alumni/inactive excluded. **Big brothers themselves can be anyone in `chapter_roster`** (active status of bb is irrelevant) |
| Distractor era radius | **±5 years initiation_date, fall back to ±10 yrs, then any roster row with `roll` set, then pad with `"Unknown #<roll>"` placeholders** | Spec says ±5 but doesn't address sparse `initiation_date`. Cascading fallback keeps the game playable on roster rows with thin data |
| `game_enabled` flag | **Included; defaults to `false`** | Kill switch. Admin flips on after manual verification. Cheap insurance |
| Admin cleanup UI location | **TransitionTab.tsx section** | Spec says "TransitionTab.tsx (or new tab)". Keeps the existing 8-tab count stable |
| Anti-cheat sanity floor | **`time_seconds >= score * 0.5`** (spec) | Max score with 25 questions of all-roll type = 50 pts → 25s floor. A fast human can clear that; only the absurd cheats are rejected |
| Score endpoint validates max score against `member_count * 2 + member_count * 1` | Yes | Spec §"/api/game/score validation" line 235. Caps gross score-stuffing |
| Per-question timer freeze during 800ms feedback animation | **No** (per spec line 204) | "Keep it running, that's part of the challenge" |
| Profanity filter on usernames | **No** (per spec §Non-Goals) | Chapter is small, self-moderates. Admin can clear bad entries |
| Tests | **No automated tests** | Matches existing codebase pattern |

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/migration_add_game_leaderboard.sql` | NEW | Creates `game_leaderboard` table + index; inserts `game_enabled = 'false'` settings row |
| `lib/types.ts` | MODIFIED | Adds `LeaderboardEntry`, `GameQuestion`, `GameStartResponse` interfaces |
| `app/api/game/start/route.ts` | NEW | GET. Builds randomized question pool + era-matched distractors. Public. `publicLimiter`. |
| `app/api/game/score/route.ts` | NEW | POST. Validates score+time, inserts leaderboard row, returns rank. Public. `publicLimiter`. |
| `app/api/game/leaderboard/route.ts` | NEW | GET. Top-3 read with `Cache-Control: public, s-maxage=10`. Public. `publicLimiter`. |
| `app/api/admin/leaderboard/route.ts` | NEW | DELETE all (owner only, audit-logged). |
| `app/api/admin/leaderboard/[id]/route.ts` | NEW | DELETE one (owner only, audit-logged). |
| `app/game/page.tsx` | NEW | Client component. Three view states (start, playing, over). Two question types (bigbro 4-choice, roll numeric input). |
| `app/game/game.css` | NEW | Bespoke styles for the game (centered card, timer, lives, score header, question grid). Imported by `app/game/page.tsx`. |
| `app/page.tsx` | MODIFIED | Adds "Play Chapter Trivia" link + inline top-3 leaderboard (hidden when `game_enabled === false`). |
| `app/admin/components/TransitionTab.tsx` | MODIFIED | New "Game Leaderboard" section: top-3 readout, "Clear All" button, `game_enabled` toggle. |
| `app/api/settings/route.ts` | MODIFIED | Returns `game_enabled` in the public settings payload so home page can hide the play button. |
| `app/api/admin/settings/route.ts` | MODIFIED | Allowed-keys list includes `game_enabled` for the admin toggle. |

---

## Task 1: Schema + Types + Settings Row

**Files:**
- Create: `supabase/migrations/migration_add_game_leaderboard.sql`
- Modify: `lib/types.ts`

### Step 1.1: Create the migration

Create `supabase/migrations/migration_add_game_leaderboard.sql` with:

```sql
-- Stores the trivia game's leaderboard. Top 3 entries surface on the public home page.
-- Client-side scoring per spec §Anti-Cheat; sanity-floor enforced server-side in /api/game/score.

CREATE TABLE game_leaderboard (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL,
  score         INTEGER NOT NULL CHECK (score >= 0),
  time_seconds  INTEGER NOT NULL CHECK (time_seconds >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for the top-3 query: ORDER BY score DESC, time_seconds ASC, created_at ASC
CREATE INDEX idx_game_leaderboard_rank ON game_leaderboard(score DESC, time_seconds ASC, created_at ASC);

-- Kill switch / soft-launch gate. Admin flips to 'true' from the Transition tab once verified.
INSERT INTO settings (key, value) VALUES ('game_enabled', 'false') ON CONFLICT (key) DO NOTHING;
```

### Step 1.2: Add types to `lib/types.ts`

Append AFTER the existing `ChapterRosterEntry` interface (after line 109):

```ts
export interface LeaderboardEntry {
  id: string;
  username: string;
  score: number;
  time_seconds: number;
  created_at: string;
}

export type GameQuestionType = "bigbro" | "roll";

export interface GameQuestion {
  member_name: string;
  type: GameQuestionType;
  // For bigbro: 4 options pre-shuffled (correct + 3 distractors). For roll: omitted.
  options?: Array<{ roll: number; name: string }>;
  // Roll # of correct big bro (bigbro questions), OR the member's own roll # (roll questions).
  correct_answer: number;
}

export interface GameStartResponse {
  questions: GameQuestion[];
}
```

### Step 1.3: Verify compile

Run from `C:\Users\Dillon\berged-source`:

```bash
npx tsc --noEmit
```

Expected: zero errors.

### Step 1.4: Commit

```bash
git add supabase/migrations/migration_add_game_leaderboard.sql lib/types.ts
git commit -m "feat(game): add game_leaderboard schema + types + game_enabled settings row"
```

### Step 1.5: Hand off to user for migration run

**This step is MANUAL.** The implementer does NOT run the migration. After the commit, the controller tells the user: "Run `supabase/migrations/migration_add_game_leaderboard.sql` in the Supabase SQL Editor before proceeding to Task 2." Same pattern as Phase 1's roster migration.

---

## Task 2: Game Public APIs

**Files:**
- Create: `app/api/game/start/route.ts`
- Create: `app/api/game/score/route.ts`
- Create: `app/api/game/leaderboard/route.ts`
- Modify: `app/api/settings/route.ts` (expose `game_enabled` publicly)

### Step 2.1: Create `app/api/game/start/route.ts`

```ts
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
```

### Step 2.2: Create `app/api/game/score/route.ts`

```ts
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
```

### Step 2.3: Create `app/api/game/leaderboard/route.ts`

```ts
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("game_leaderboard")
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
```

### Step 2.4: Expose `game_enabled` in the public `/api/settings`

Read `app/api/settings/route.ts` first to confirm its current shape (an existing route that returns a small public JSON of settings). Then modify the SELECT to include `game_enabled` and add it to the response shape. The exact edit will depend on the existing code; the implementer should:

- Add `'game_enabled'` to whatever allowlist controls which settings keys leak publicly
- Surface the value as `game_enabled: data.game_enabled === 'true'` (boolean) in the response

If the route does a wide SELECT and returns all key/value pairs, the change might be a no-op — verify by reading.

### Step 2.5: Verify compile

```bash
npx tsc --noEmit
```

Expected: zero errors.

### Step 2.6: Commit

```bash
git add app/api/game/ app/api/settings/route.ts
git commit -m "feat(game): public game APIs (start/score/leaderboard) + game_enabled in public settings"
```

---

## Task 3: `/game` Page (client component)

**Files:**
- Create: `app/game/page.tsx`
- Create: `app/game/game.css`

### Step 3.1: Create `app/game/game.css`

```css
.game-shell {
  min-height: 100vh;
  background: var(--bg-base, #0e0e10);
  color: var(--text-base, #e9e3d6);
  font-family: 'IBM Plex Mono', monospace;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
}

.game-card {
  background: var(--surface, #1a1916);
  border: 1px solid var(--border, #2a2820);
  border-radius: 8px;
  padding: 32px;
  max-width: 600px;
  width: 100%;
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
}

.game-title {
  font-size: 24px;
  color: var(--gold, #c9a85a);
  margin: 0 0 12px;
  letter-spacing: 0.05em;
}

.game-rules {
  font-size: 13px;
  color: var(--text-dim, #9a917f);
  margin: 0 0 24px;
  line-height: 1.5;
}

.game-input {
  width: 100%;
  background: var(--bg-base, #0e0e10);
  border: 1px solid var(--border, #2a2820);
  color: var(--text-base, #e9e3d6);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 4px;
  box-sizing: border-box;
}

.game-btn {
  background: var(--gold, #c9a85a);
  color: var(--bg-base, #0e0e10);
  border: none;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 24px;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 0.05em;
}
.game-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.game-btn-ghost {
  background: transparent;
  color: var(--text-dim, #9a917f);
  border: 1px solid var(--border, #2a2820);
}

.game-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 600px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-dim, #9a917f);
}

.game-question {
  font-size: 18px;
  margin: 16px 0 24px;
  line-height: 1.4;
}
.game-question strong { color: var(--gold, #c9a85a); }

.game-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.game-options button {
  background: var(--bg-base, #0e0e10);
  border: 1px solid var(--border, #2a2820);
  color: var(--text-base, #e9e3d6);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 14px;
  padding: 16px 12px;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}
.game-options button:hover:not(:disabled) {
  border-color: var(--gold, #c9a85a);
  background: rgba(201, 168, 90, 0.05);
}
.game-options button:disabled { cursor: default; }
.game-options button.correct {
  border-color: #10B981;
  background: rgba(16, 185, 129, 0.15);
}
.game-options button.wrong {
  border-color: #EF4444;
  background: rgba(239, 68, 68, 0.15);
}
@media (max-width: 480px) {
  .game-options { grid-template-columns: 1fr; }
}

.game-feedback {
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
  text-align: center;
}
.game-feedback.correct { background: rgba(16, 185, 129, 0.15); color: #10B981; }
.game-feedback.wrong { background: rgba(239, 68, 68, 0.15); color: #EF4444; }

.game-leaderboard {
  margin-top: 24px;
  font-size: 13px;
}
.game-leaderboard h3 { color: var(--gold, #c9a85a); margin: 0 0 8px; font-size: 14px; letter-spacing: 0.05em; }
.game-leaderboard ol { padding: 0 0 0 24px; margin: 0; }
.game-leaderboard li { margin: 4px 0; color: var(--text-dim, #9a917f); }
.game-leaderboard li strong { color: var(--text-base, #e9e3d6); font-weight: 500; }
```

### Step 3.2: Create `app/game/page.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameQuestion, LeaderboardEntry } from "@/lib/types";
import "./game.css";

type GameState = "start" | "playing" | "over";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="game-leaderboard">
        <h3>Top 3</h3>
        <p style={{ color: "var(--text-dim, #9a917f)", margin: 0 }}>No entries yet — be the first.</p>
      </div>
    );
  }
  return (
    <div className="game-leaderboard">
      <h3>Top 3</h3>
      <ol>
        {entries.map((e) => (
          <li key={e.id}>
            <strong>{e.username}</strong> — {e.score} pts in {formatTime(e.time_seconds)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function GamePage() {
  const [state, setState] = useState<GameState>("start");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [startTime, setStartTime] = useState<number>(0);
  const [now, setNow] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ kind: "correct" | "wrong"; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const [rollInput, setRollInput] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalRank, setFinalRank] = useState<number | null>(null);
  const [submitErr, setSubmitErr] = useState("");
  const [startErr, setStartErr] = useState("");
  const submitRef = useRef(false);

  // Load top-3 on mount and after game-over
  useEffect(() => {
    fetch("/api/game/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaderboard(Array.isArray(d.entries) ? d.entries : []))
      .catch(() => {});
  }, [state]);

  // Timer interval (1Hz) while playing
  useEffect(() => {
    if (state !== "playing") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);

  async function handleStart() {
    setUsernameError("");
    setStartErr("");
    const trimmed = username.trim();
    if (!/^[A-Za-z0-9 ]{1,16}$/.test(trimmed)) {
      setUsernameError("1-16 characters, letters/digits/spaces only");
      return;
    }
    try {
      const res = await fetch("/api/game/start");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStartErr(data.error ?? "Failed to start game");
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        setStartErr("No questions available right now");
        return;
      }
      setQuestions(data.questions);
      setIndex(0);
      setScore(0);
      setLives(3);
      setRollInput("");
      setFeedback(null);
      setLocked(false);
      submitRef.current = false;
      const t = Date.now();
      setStartTime(t);
      setNow(t);
      setState("playing");
    } catch {
      setStartErr("Network error starting game");
    }
  }

  function advanceOrEnd(newScore: number, newLives: number) {
    const next = index + 1;
    if (newLives <= 0 || next >= questions.length) {
      setScore(newScore);
      setLives(newLives);
      setState("over");
      return;
    }
    setScore(newScore);
    setLives(newLives);
    setIndex(next);
    setRollInput("");
    setFeedback(null);
    setLocked(false);
  }

  function answerBigbro(pickedRoll: number) {
    if (locked) return;
    const q = questions[index];
    setLocked(true);
    const correct = pickedRoll === q.correct_answer;
    if (correct) {
      setFeedback({ kind: "correct", text: "Correct!" });
      setTimeout(() => advanceOrEnd(score + 1, lives), 800);
    } else {
      const correctName = q.options?.find((o) => o.roll === q.correct_answer)?.name ?? `#${q.correct_answer}`;
      setFeedback({ kind: "wrong", text: `Wrong! Answer: ${correctName}` });
      setTimeout(() => advanceOrEnd(score, lives - 1), 800);
    }
  }

  function answerRoll() {
    if (locked) return;
    const q = questions[index];
    const parsed = parseInt(rollInput.trim(), 10);
    if (!Number.isInteger(parsed)) return;
    setLocked(true);
    const correct = parsed === q.correct_answer;
    if (correct) {
      setFeedback({ kind: "correct", text: "Correct!" });
      setTimeout(() => advanceOrEnd(score + 2, lives), 800);
    } else {
      setFeedback({ kind: "wrong", text: `Wrong! Answer: #${q.correct_answer}` });
      setTimeout(() => advanceOrEnd(score, lives - 1), 800);
    }
  }

  // Submit score on entering 'over' (once)
  useEffect(() => {
    if (state !== "over" || submitRef.current) return;
    submitRef.current = true;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    fetch("/api/game/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), score, time_seconds: elapsedSec }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSubmitErr(data.error ?? "Couldn't save score");
          return;
        }
        setFinalRank(typeof data.rank === "number" ? data.rank : null);
      })
      .catch(() => setSubmitErr("Network error saving score"));
  }, [state, startTime, score, username]);

  // Render: start
  if (state === "start") {
    return (
      <main className="game-shell">
        <div className="game-card">
          <h1 className="game-title">Acacia Roll Number Game</h1>
          <p className="game-rules">
            3 lives. 1 point for each big brother you match. 2 points for each roll number you remember. Fastest time wins.
          </p>
          <label htmlFor="game-username" style={{ fontSize: 12, color: "var(--text-dim, #9a917f)" }}>Username</label>
          <input
            id="game-username"
            className="game-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={16}
            placeholder="1-16 chars"
            autoComplete="off"
            style={{ margin: "4px 0 12px" }}
          />
          {usernameError && <p style={{ color: "#EF4444", fontSize: 12, margin: "0 0 12px" }}>{usernameError}</p>}
          {startErr && <p style={{ color: "#EF4444", fontSize: 12, margin: "0 0 12px" }}>{startErr}</p>}
          <button className="game-btn" onClick={handleStart} disabled={!username.trim()}>
            Start
          </button>
          <Leaderboard entries={leaderboard} />
          <div style={{ marginTop: 24, fontSize: 12 }}>
            <Link href="/" style={{ color: "var(--text-dim, #9a917f)" }}>← Back to home</Link>
          </div>
        </div>
      </main>
    );
  }

  // Render: playing
  if (state === "playing") {
    const q = questions[index];
    const elapsedSec = Math.max(0, Math.floor((now - startTime) / 1000));
    return (
      <main className="game-shell">
        <div className="game-header-bar">
          <span>⏱ {formatTime(elapsedSec)}</span>
          <span>{"💀".repeat(lives)}</span>
          <span>SCORE {score}</span>
        </div>
        <div className="game-card">
          <div style={{ fontSize: 12, color: "var(--text-dim, #9a917f)" }}>
            Question {index + 1} of {questions.length}
          </div>
          {q.type === "bigbro" ? (
            <>
              <p className="game-question">Who is the big brother of <strong>{q.member_name}</strong>?</p>
              <div className="game-options">
                {q.options?.map((o) => {
                  const showResult = locked;
                  const isCorrect = o.roll === q.correct_answer;
                  const cls = showResult && isCorrect ? "correct" : "";
                  return (
                    <button key={o.roll} onClick={() => answerBigbro(o.roll)} disabled={locked} className={cls}>
                      {o.name}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="game-question">What is <strong>{q.member_name}</strong>'s roll number?</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="game-input"
                  type="number"
                  value={rollInput}
                  onChange={(e) => setRollInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") answerRoll(); }}
                  placeholder="e.g. 1234"
                  disabled={locked}
                  autoFocus
                />
                <button className="game-btn" onClick={answerRoll} disabled={locked || !rollInput.trim()}>
                  Submit
                </button>
              </div>
            </>
          )}
          {feedback && <div className={`game-feedback ${feedback.kind}`}>{feedback.text}</div>}
        </div>
      </main>
    );
  }

  // Render: over
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const allDone = lives > 0 && index >= questions.length - 1;
  return (
    <main className="game-shell">
      <div className="game-card">
        <h1 className="game-title">{allDone ? "ALL DONE!" : "GAME OVER"}</h1>
        <p className="game-rules">
          Score: <strong style={{ color: "var(--gold, #c9a85a)" }}>{score}</strong> · Time: <strong style={{ color: "var(--gold, #c9a85a)" }}>{formatTime(elapsedSec)}</strong>
        </p>
        {finalRank != null && (
          <p style={{ color: "#c9a85a", fontSize: 16, margin: "0 0 16px" }}>
            🏆 You made #{finalRank} on the leaderboard!
          </p>
        )}
        {submitErr && <p style={{ color: "#EF4444", fontSize: 12 }}>{submitErr}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="game-btn" onClick={() => { setState("start"); setSubmitErr(""); setFinalRank(null); }}>
            Play Again
          </button>
          <Link href="/" className="game-btn game-btn-ghost" style={{ textDecoration: "none", display: "inline-block" }}>
            Back to Home
          </Link>
        </div>
        <Leaderboard entries={leaderboard} />
      </div>
    </main>
  );
}
```

### Step 3.3: Verify compile

```bash
npx tsc --noEmit
```

### Step 3.4: Commit

```bash
git add app/game/
git commit -m "feat(game): /game page with start/playing/over states + leaderboard inline"
```

---

## Task 4: Home Page Integration

**Files:**
- Modify: `app/page.tsx`

### Step 4.1: Read the existing home page

The implementer must first read `app/page.tsx` (~200 lines, client component already fetching `/api/members` and `/api/settings` on mount) and find:

- The existing `useEffect` that calls `fetch("/api/settings")` — extend it to also store `game_enabled` from the response, and to fetch `/api/game/leaderboard` if enabled
- The JSX section where the existing crest/search form lives — add the "Play" button and inline top-3 BELOW it

### Step 4.2: Add `gameEnabled` and `topThree` state + extended fetch

Near the existing `useState` calls, add:

```tsx
  const [gameEnabled, setGameEnabled] = useState(false);
  const [topThree, setTopThree] = useState<Array<{ id: string; username: string; score: number; time_seconds: number }>>([]);
```

In the existing settings fetch chain (where `setVenmo(...)` is called), extend the chain. The current code is:

```tsx
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setVenmo({ ... }))
      .catch(() => {});
```

Change to:

```tsx
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setVenmo({ handle: d.venmo_handle ?? "@Dillon-Berge", url: d.venmo_url ?? "https://venmo.com/Dillon-Berge" });
        const enabled = d.game_enabled === true || d.game_enabled === "true";
        setGameEnabled(enabled);
        if (enabled) {
          fetch("/api/game/leaderboard")
            .then((r) => r.json())
            .then((g) => setTopThree(Array.isArray(g.entries) ? g.entries : []))
            .catch(() => {});
        }
      })
      .catch(() => {});
```

### Step 4.3: Add Play button + inline top-3 to the JSX

Find a sensible location in the existing JSX — somewhere AFTER the main fine-lookup section but before the page footer (Venmo info). Look for a `</div>` near the end of the main content. Insert (using inline styles to match the existing public-page style — no `adm-*` classes since this isn't admin):

```tsx
{gameEnabled && (
  <div style={{
    marginTop: 48,
    padding: 24,
    borderTop: "1px solid #2a2820",
    width: "100%",
    maxWidth: 640,
    fontFamily: "'IBM Plex Mono', monospace",
    color: "#9a917f",
  }}>
    <a
      href="/game"
      style={{
        display: "inline-block",
        background: "#c9a85a",
        color: "#0e0e10",
        padding: "10px 24px",
        borderRadius: 4,
        textDecoration: "none",
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: "0.05em",
      }}
    >
      🎮 Play Chapter Trivia
    </a>
    {topThree.length > 0 && (
      <div style={{ marginTop: 16, fontSize: 13 }}>
        <div style={{ color: "#c9a85a", marginBottom: 6, letterSpacing: "0.05em" }}>TOP 3</div>
        <ol style={{ paddingLeft: 24, margin: 0 }}>
          {topThree.map((e) => {
            const m = Math.floor(e.time_seconds / 60);
            const s = e.time_seconds % 60;
            return (
              <li key={e.id} style={{ margin: "4px 0" }}>
                <strong style={{ color: "#e9e3d6", fontWeight: 500 }}>{e.username}</strong> — {e.score} pts in {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
              </li>
            );
          })}
        </ol>
      </div>
    )}
  </div>
)}
```

The implementer's job: pick the right insertion point by reading the existing JSX structure. If unclear, ask the controller.

### Step 4.4: Verify compile

```bash
npx tsc --noEmit
```

### Step 4.5: Commit

```bash
git add app/page.tsx
git commit -m "feat(game): add Play Chapter Trivia button + inline top-3 to home page (gated by game_enabled)"
```

---

## Task 5: Admin Cleanup Endpoints

**Files:**
- Create: `app/api/admin/leaderboard/route.ts` (DELETE all)
- Create: `app/api/admin/leaderboard/[id]/route.ts` (DELETE one)

### Step 5.1: Create `app/api/admin/leaderboard/route.ts`

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

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
```

### Step 5.2: Create `app/api/admin/leaderboard/[id]/route.ts`

Note: Next.js 16 — params are Promises and must be awaited.

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
```

### Step 5.3: Verify compile

```bash
npx tsc --noEmit
```

### Step 5.4: Commit

```bash
git add app/api/admin/leaderboard/
git commit -m "feat(admin): leaderboard cleanup endpoints (delete-all + delete-one, audit-logged)"
```

---

## Task 6: Admin TransitionTab Additions

**Files:**
- Modify: `app/admin/components/TransitionTab.tsx`
- Modify: `app/api/admin/settings/route.ts` (allowed-keys list)

### Step 6.1: Allow `game_enabled` in the admin settings PUT

Read `app/api/admin/settings/route.ts` first. It already has an allowed-keys list (per project memory) — add `'game_enabled'` to that list. If the file has a constant like `ALLOWED_KEYS` or similar, append `'game_enabled'`.

If the structure isn't immediately obvious, the implementer should report `NEEDS_CONTEXT` and the controller will read the file.

### Step 6.2: Add leaderboard state + load to TransitionTab

Near the other `useState` calls in `TransitionTab.tsx`, add:

```tsx
  const [leaderboardEntries, setLeaderboardEntries] = useState<Array<{ id: string; username: string; score: number; time_seconds: number; created_at: string }>>([]);
  const [leaderboardCount, setLeaderboardCount] = useState(0);
  const [leaderboardClearing, setLeaderboardClearing] = useState(false);
  const [gameEnabled, setGameEnabled] = useState(false);
  const [gameEnabledSaving, setGameEnabledSaving] = useState(false);
```

Extend the existing `loadSettings()` function (which sets `venmoForm`, `defaultSheetId`, `exportHistory`) to also set `gameEnabled`:

```tsx
        setGameEnabled(data.game_enabled === true || data.game_enabled === "true");
```

Add a new function `loadLeaderboard()` near `loadAdminUsers()`:

```tsx
  async function loadLeaderboard() {
    const res = await fetch("/api/game/leaderboard");
    if (res.ok) {
      const data = await res.json();
      setLeaderboardEntries(Array.isArray(data.entries) ? data.entries : []);
    }
    // Total count: separate endpoint not built; use top-3 as a proxy + count below if needed.
    // For now we just show top-3 + a "Clear All" button which deletes everything.
  }
```

In the existing `useEffect` at component mount (currently `loadAdminUsers(); loadSettings();`), add `loadLeaderboard();`.

### Step 6.3: Add the toggle + clear handlers

Add two new handler functions inside the component:

```tsx
  async function toggleGameEnabled(next: boolean) {
    setGameEnabledSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_enabled: next ? "true" : "false" }),
    });
    if (res.ok) setGameEnabled(next);
    setGameEnabledSaving(false);
  }

  async function clearLeaderboard() {
    if (!confirm("Delete ALL leaderboard entries? This cannot be undone.")) return;
    setLeaderboardClearing(true);
    const res = await fetch("/api/admin/leaderboard", { method: "DELETE" });
    if (res.ok) await loadLeaderboard();
    setLeaderboardClearing(false);
  }

  async function deleteLeaderboardEntry(id: string, username: string) {
    if (!confirm(`Remove ${username}'s entry?`)) return;
    const res = await fetch(`/api/admin/leaderboard/${id}`, { method: "DELETE" });
    if (res.ok) await loadLeaderboard();
  }
```

### Step 6.4: Add the new section to the JSX

Find a sensible spot in the existing TransitionTab JSX (e.g., between the existing "Venmo" and "Export" sections, or at the bottom). Insert:

```tsx
        <div className="adm-card" style={{ marginTop: 24 }}>
          <div className="adm-card-header">
            <span className="adm-card-title">Chapter Trivia Game</span>
          </div>
          <div className="adm-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={gameEnabled}
                  onChange={(e) => toggleGameEnabled(e.target.checked)}
                  disabled={gameEnabledSaving}
                />
                <span style={{ fontSize: 13 }}>Game enabled (public site shows Play button + leaderboard)</span>
              </label>
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
                Top 3 Leaderboard
              </div>
              {leaderboardEntries.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>No entries yet.</p>
              ) : (
                <table className="adm-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Score</th>
                      <th>Time</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardEntries.map((e) => {
                      const m = Math.floor(e.time_seconds / 60);
                      const s = e.time_seconds % 60;
                      return (
                        <tr key={e.id}>
                          <td>{e.username}</td>
                          <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--gold)" }}>{e.score}</td>
                          <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</td>
                          <td style={{ textAlign: "right" }}>
                            <button className="adm-delete-btn" onClick={() => deleteLeaderboardEntry(e.id, e.username)}>Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <button
                onClick={clearLeaderboard}
                disabled={leaderboardClearing || leaderboardEntries.length === 0}
                className="adm-btn"
                style={{ background: "#7F1D1D", color: "#FEE2E2" }}
              >
                {leaderboardClearing ? "Clearing…" : "Clear All Entries"}
              </button>
            </div>
          </div>
        </div>
```

### Step 6.5: Verify compile

```bash
npx tsc --noEmit
```

### Step 6.6: Commit

```bash
git add app/admin/components/TransitionTab.tsx app/api/admin/settings/route.ts
git commit -m "feat(admin): Transition tab game section (enable toggle + leaderboard cleanup)"
```

---

## Self-Review Notes

- **Spec coverage:** §"Database" (`game_leaderboard`) → Task 1. §"Public Game" entry point → Task 4. §"/game" page → Task 3. §"API Endpoints" public → Task 2. §"API Endpoints" admin → Task 5. §"Admin Cleanup Tool" → Task 6. All covered.
- **Deviation:** Question count fixed at 25 instead of "shuffle the full pool" (spec line 169) — pure scope discipline; the spec's "shuffle full pool" would produce 100+ question games which is too long.
- **Distractor fallback chain:** ±5 → ±10 → any roster → synthetic placeholders — additive to spec line 164, not contradicting.
- **`game_enabled` flag:** plan adds this for safety; not explicitly required by spec but mentioned as a possibility in spec line 298.
- **Atomicity:** all admin DELETEs are single-row or single-table; no compensating logic needed.
- **No automated tests:** matches codebase. All verification is manual.

## Verification Punch-List (After All Tasks Ship)

Walk this list in the browser. Each item gets a ✅ or a bug report:

**Pre-game (game disabled):**
- [ ] Home page: no Play button visible when `game_enabled === 'false'`
- [ ] `/game` direct visit: shows the game start screen (the gate is on `/api/game/start`, not the page itself — verify start fails with "Game is not currently enabled")

**Enable the game (admin):**
- [ ] Transition tab: "Chapter Trivia Game" section appears
- [ ] Toggle "Game enabled" on → home page now shows Play button
- [ ] Toggle off → button hides

**Game flow:**
- [ ] Click Play → /game opens, leaderboard empty
- [ ] Enter username, click Start → questions begin
- [ ] Answer correctly → 800ms green flash → next question
- [ ] Answer wrong → 800ms red flash + correct answer shown → next question, lives decrement
- [ ] Run out of lives → game over screen, score submitted
- [ ] Complete all 25 questions → all-done screen
- [ ] Get a top-3 score → "🏆 You made #N on the leaderboard!" appears
- [ ] Play Again → resets to start screen

**Anti-cheat:**
- [ ] curl POST `/api/game/score -d '{"username":"cheat","score":50,"time_seconds":1}'` → 400
- [ ] curl POST with `username: "<script>"` → 400
- [ ] curl POST 30+ times in a minute → 429

**Admin cleanup:**
- [ ] TransitionTab shows up to 3 leaderboard entries with "Remove" buttons
- [ ] Click Remove → confirm modal → entry deleted, list refreshes, audit log written
- [ ] "Clear All Entries" → confirm → all entries deleted, audit log written

## Future Memory Update (After Phase 3+4 Ships)

Update `project_fines_website.md` with:
- New tables: `game_leaderboard`
- New settings key: `game_enabled`
- New public routes: `/game`, `/api/game/{start,score,leaderboard}`
- New admin routes: `/api/admin/leaderboard`, `/api/admin/leaderboard/[id]`
- Question count fixed at 25, distractor fallback chain documented
- `game_enabled` flag mechanism for soft-launch
- Anti-cheat acknowledged: client-scored game, admin-clearable leaderboard
