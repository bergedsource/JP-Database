# Chapter Roster Trivia Game — Design

## Problem

Members of the chapter (and curious alumni / visitors) have no fun way to engage with the chapter's institutional knowledge — who is whose big brother, what roll numbers map to which names. This data exists in Dillon's offline spreadsheet (a 1390-entry Master Roll Numbers PDF spanning 1924–present) but isn't represented in the website's database at all today.

## Goal

Ship a public, low-stakes trivia game on `acaciajp.com` where any visitor can:

1. Enter a session-only username
2. Be quizzed alternately on (a) which roster member is the big brother of a current chapter member, and (b) what a current member's roll # is
3. Compete for one of the top 3 leaderboard spots, ranked by score then completion time

The game must be entertaining for chapter members today, not require auth, and not break the existing fines/admin system.

## Non-Goals

- Family-tree / lineage visualizations (could come later, separate spec)
- Exposing the full 1390-entry historical roster as a browsable public list
- Surfacing big-brother data anywhere in the existing admin UI besides the new-member form
- Authenticated user accounts, per-player history, or stat tracking across sessions
- Server-side authoritative game state (intentionally client-side — see Anti-Cheat section)
- Profanity filter on usernames (the chapter is small enough to self-moderate; admin can clear bad entries from the leaderboard manually if needed)
- Automatic leaderboard resets (manual clear by admin only)

## Architecture Overview

Three independent pieces ship together but can be reasoned about separately:

1. **`chapter_roster` table + one-time PDF import** — historical data, source of truth for the game's question pool
2. **Admin "Big Brother" field on new-member creation** — keeps the roster growing as new actives/pledges are added through the normal admin flow
3. **Public game page + leaderboard** — the user-facing trivia game itself

The game pulls from `chapter_roster` (not `members`) for question content, but limits the *subjects* of questions to people listed in the current `members` table. This keeps the game relevant to today's chapter while leveraging the roster's depth for distractor names and big-bro lookups.

## Database

### New table: `chapter_roster`

| Column | Type | Notes |
|---|---|---|
| `roll` | `integer` | Primary key. Matches `members.roll` when applicable. |
| `name` | `text` | Full name as it appears in the PDF. |
| `initiation_class` | `text` | e.g. "Fall 2024", "Founder 1924", "Honorary". Free text. |
| `initiation_date` | `date` | Nullable — some honorary entries have only the class. |
| `big_brother_roll` | `integer` | Nullable. Self-FK to `chapter_roster(roll)`. |
| `notes` | `text` | Nullable. The "Venerable Dean / Other" column from the PDF (e.g. "VD 2024", "Order of Pythagoras"). |
| `created_at` | `timestamptz` | Default `now()`. |

Constraints:
- `PRIMARY KEY (roll)`
- `FOREIGN KEY (big_brother_roll) REFERENCES chapter_roster(roll) ON DELETE SET NULL`
- Self-reference must be deferrable for the bulk import (insert all rows first, then verify FK)

No RLS read policy — table is read via service client only.

### New table: `game_leaderboard`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()`. |
| `username` | `text` | 1–16 chars, validated `^[A-Za-z0-9 ]{1,16}$`. |
| `score` | `integer` | ≥ 0. |
| `time_seconds` | `integer` | ≥ 0. Total seconds from first-question-shown to game-over. |
| `created_at` | `timestamptz` | Default `now()`. |

Index: `(score DESC, time_seconds ASC, created_at ASC)` for the top-3 query.

No public RLS read policy. The public API endpoint reads via service client.

### Migration files

- `supabase/migrations/migration_add_chapter_roster.sql` — creates `chapter_roster`
- `supabase/migrations/migration_add_game_leaderboard.sql` — creates `game_leaderboard`

Both follow the existing migration pattern: standalone `.sql` files run manually in the Supabase SQL Editor.

## One-Time PDF Import

### Script: `scripts/import-chapter-roster.ts`

A standalone Node script (run once, kept in repo for re-runs after data corrections):

1. **Source data:** Parse the PDF at `C:\Users\Dillon\Downloads\Fantastic Master Roll Numbers - Sheet1.pdf`. Library: `pdf-parse` (no native deps, works on Windows). Alternative if PDF parsing is brittle: ask Dillon to export Google Sheets → CSV and point the script at that. PDF parsing is the first attempt.
2. **Per row, extract:** roll #, name, initiation class, date, big bro field, notes column
3. **Parse big bro field** with regex `/\s(\d+)\s*$/` to capture the trailing roll number. The name part is discarded — we only need the number for the FK. If no trailing number, big bro is `null`.
4. **Validation pass** before any INSERT:
   - Self-references (member with `big_brother_roll == roll`) → log and skip the big bro link, insert the member with `big_brother_roll = null`
   - Big bro roll # that doesn't exist anywhere in the parsed data → same: insert member with `null`, log warning
   - Missing roll #, missing name → skip the row entirely, log error
   - Empty rows (the 1391–1400+ placeholder rows in the PDF) → skip silently
5. **Output before insert:** prints a summary — total parsed, total inserted, total with big bro link, total with null big bro, list of all warnings/skips. Dillon reviews this output before answering an interactive "Proceed with insert? (y/n)" prompt.
6. **Insert:** wrapped in a transaction. Deletes existing `chapter_roster` rows first (so re-runs are idempotent), then bulk-inserts.

The script is run from the project root: `npx tsx scripts/import-chapter-roster.ts`. Documented in a short comment block at the top of the file.

### Known data issues from PDF inspection

Already cataloged during brainstorming:
- Row 1147 ("Thomas Edwin Moore IV"): big bro listed as "John Boyd 133" — Boyd's actual roll is 1133. Likely typo. Will be flagged as a broken FK (133 doesn't exist).
- Row 1180 ("Willy Hang Wong"): big bro field is just "1" with no name — invalid, will become null.
- Row 1182 ("Keven Estupinian"): big bro listed as "Matt Tong 1182" — self-reference and Matt Tong is actually 1140. Will become null, flagged for manual fix.
- Row 1188 ("Owen Loughran"): big bro "Adrian Williams 1149" — Adrian Williams is actually 1150. Will be flagged.

These are not blockers — the script handles them gracefully and prints them for manual cleanup post-import.

## Admin Form Change

**File:** `app/admin/components/MembersTab.tsx`, `app/api/admin/members/route.ts`

Add a new optional field to the existing "Add Member" form (between Roll # and Status):

**UI:**
- Label: "Big Brother (optional)"
- Search-as-you-type autocomplete, matching against `chapter_roster.name` (case-insensitive substring, limit 8 results)
- Each suggestion shows: `name (#roll, initiation_class)` e.g. `Nikolas Vidmantas (#1290, Fall 2022)`
- Picking a suggestion stores the big bro's roll # in form state; the input shows the chosen name
- Clear button (×) to unselect
- New autocomplete endpoint: `GET /api/admin/roster/search?q=...` (owner/root only, rate-limited via `adminLimiter`). Returns `[{roll, name, initiation_class}]`.

**Backend (members POST):**
- Accept new optional `big_brother_roll: number | null` in request body
- Validate: if not null, must be an integer that exists in `chapter_roster.roll`
- **On successful member insert:**
  - If `roll` is provided AND no existing `chapter_roster` row has that roll: also insert a new `chapter_roster` row with `{roll, name, initiation_class: 'New (' + status + ')', initiation_date: today, big_brother_roll, notes: null}`. This is how the roster keeps growing.
  - If `roll` is provided AND a `chapter_roster` row already exists with that roll (e.g., the new member is being entered against an existing roster entry): UPDATE the existing row to set `big_brother_roll` if it was null, else leave it.
  - If `roll` is null on the new member: do nothing to the roster (can't link).
- Audit log entry uses existing format, adds "Big Bro: {bb_name}" to the details string if set.

## Public Game

### Entry point

**File:** `app/page.tsx`

Add a button near the existing member search:
- Label: "🎮 Play Chapter Trivia"
- Anchor styled to match existing aesthetic (gold accent, monospace)
- Links to `/game` route

Below or beside the button, render the top-3 leaderboard inline (read-only): rank, username, score, time. Auto-refreshes on page load.

### Game page

**File:** `app/game/page.tsx` (new route)

Client component, all game logic in one file initially. Three view states managed via local `gameState` enum: `'start' | 'playing' | 'over'`.

**Start state UI:**
- Centered card
- Heading: "Acacia Roll Number Game"
- Brief 2-sentence rules ("3 lives. 1 point for each big brother you match. 2 points for each roll number you remember. Fastest time wins.")
- Username input (`maxLength=16`, pattern `[A-Za-z0-9 ]+`)
- "Start" button (disabled until valid username)
- Top-3 leaderboard rendered below
- "Back to home" link

**On Start click:**
- Fetch `GET /api/game/start` → returns `{ questions, distractors }` where:
  - `questions: Array<{member_name, member_roll, type: 'bigbro' | 'roll', correct_answer_roll_or_number}>`
  - For `type='bigbro'`: includes `correct_big_brother_roll` and `correct_big_brother_name`
  - For `type='roll'`: includes the correct numeric answer
  - `distractors: Record<roll, Array<{roll, name}>>` — pre-computed pool of plausible wrong-answer names per question, era-matched (members initiated within ±5 years). Server picks 3 per big-bro question; client randomly orders them with the correct answer for display.
- Question pool built server-side:
  - SELECT members where `status` IN (active, pledge, alumni, live-out, inactive, resident-advisor)
  - For each, build at most 2 questions: bigbro (if `big_brother_roll` is known via roster lookup) and roll # (if member has `roll` set)
  - Shuffle the full list
- Initialize client state: `score=0, lives=3, currentIndex=0, startTime=Date.now()`

**Playing state UI:**

Header bar (fixed top, monospace):
```
⏱ 00:42    💀💀💀    SCORE 14
```

Question card (centered):
- For `type='bigbro'`:
  - "Who is the big brother of **{member_name}**?"
  - 4 buttons in a 2×2 grid: the correct name + 3 distractors, randomly ordered. Stacks to single column on narrow screens.
- For `type='roll'`:
  - "What is **{member_name}**'s roll number?"
  - Numeric input + "Submit" button
  - Enter key submits

After answer:
- 800ms freeze with green ✓ "Correct!" or red ✗ "Wrong! Answer: {correct}"
- If wrong: `lives -= 1`. If `lives === 0`: transition to `'over'`.
- If correct: `score += 1` (bigbro) or `score += 2` (roll)
- Otherwise: `currentIndex += 1`. If `currentIndex >= questions.length`: transition to `'over'` (perfect run).
- Re-render with next question.

**Game over state UI:**
- Big "GAME OVER" or "ALL DONE!" depending on lives reason
- Final score, total time (mm:ss)
- POST `/api/game/score` with `{username, score, time_seconds}` on entering this state (only once — guarded by a ref)
- Response includes `{rank: 1|2|3|null}` — if rank, show "🏆 You made #{rank} on the leaderboard!"
- Buttons: "Play Again" (resets to `'start'` state) and "Back to Home" (link to `/`)
- Top-3 leaderboard rendered below

### Timer

Client-side, derived from `Date.now() - startTime`. Updates every second via `setInterval`. Frozen during the 800ms feedback animation? **No** — keep it running, that's part of the challenge.

## API Endpoints

| Route | Method | Auth | Rate limit | Purpose |
|---|---|---|---|---|
| `/api/game/start` | GET | none | `publicLimiter` | Build & return question pool + distractors for one game |
| `/api/game/score` | POST | none | `publicLimiter` | Validate + insert leaderboard entry, return rank |
| `/api/game/leaderboard` | GET | none | `publicLimiter` | Return top 3 entries (also cached with `Cache-Control: public, s-maxage=10`) |
| `/api/admin/roster/search` | GET | owner | `adminLimiter` | Autocomplete for new-member big bro picker |

### `/api/game/start` shape

```ts
type GameStartResponse = {
  questions: Array<{
    member_name: string;
    type: 'bigbro' | 'roll';
    // For bigbro: 4 options pre-shuffled (correct + 3 era-matched distractors)
    options?: Array<{ roll: number; name: string }>;
    correct_answer: number; // roll# of correct big bro, OR the member's own roll#
  }>;
};
```

Note the answer IS included in the payload — this is a deliberate trade-off for client-side scoring (see Anti-Cheat).

### `/api/game/score` validation

Before insert:
- `username` matches `^[A-Za-z0-9 ]{1,16}$` (trim first)
- `score >= 0` and `score <= max_possible_score` (computed as 2*member_count + 1*member_count = 3*member_count, with a buffer)
- `time_seconds >= 0`
- **Sanity floor:** `time_seconds >= score * 0.5` — i.e., humanly impossible to score 240 in less than 120 seconds. Reject with 400 if violated.
- On insert, compute rank by counting how many existing rows beat this entry on `(score DESC, time_seconds ASC)`; return `rank` if ≤ 3, else `null`.

## Anti-Cheat

**Acknowledged:** the game is client-scored. Anyone with browser devtools can mutate React state and submit any score. We accept this for v1 because:
1. The chapter is small (~80 members), social pressure self-moderates
2. The leaderboard is admin-clearable
3. Building server-authoritative state (option B in brainstorming) is overkill for a fun feature

**Mitigations applied:**
- Time-floor sanity check rejects the laziest cheats (10000 score in 1 second)
- Rate limiting on the score endpoint prevents flood-spam of fake entries
- Manual "Clear Leaderboard" button in the admin (new TransitionTab section or similar) for cleanup

**Not done:**
- No CAPTCHA
- No server-side game session tokens
- No tracking of how many questions were actually fetched vs answered

## Admin Cleanup Tool

**File:** `app/admin/components/TransitionTab.tsx` (or new tab)

Add a small section: "Game Leaderboard"
- Shows current top 3 + total entry count
- "Clear All Entries" button (owner-only, confirmation modal, audit-logged)
- Optional: per-entry delete buttons in case only one bad entry needs purging

New API route: `DELETE /api/admin/leaderboard` (clear all) and `DELETE /api/admin/leaderboard/[id]` (single).

## Files Touched / Created

### New
- `supabase/migrations/migration_add_chapter_roster.sql`
- `supabase/migrations/migration_add_game_leaderboard.sql`
- `scripts/import-chapter-roster.ts`
- `app/game/page.tsx`
- `app/api/game/start/route.ts`
- `app/api/game/score/route.ts`
- `app/api/game/leaderboard/route.ts`
- `app/api/admin/roster/search/route.ts`
- `app/api/admin/leaderboard/route.ts`
- `app/api/admin/leaderboard/[id]/route.ts`

### Modified
- `app/page.tsx` — add game button + inline top-3
- `app/admin/components/MembersTab.tsx` — add Big Brother autocomplete field
- `app/api/admin/members/route.ts` — accept `big_brother_roll`, write to `chapter_roster`
- `app/admin/components/TransitionTab.tsx` — add leaderboard cleanup section
- `lib/types.ts` — add `ChapterRosterEntry`, `LeaderboardEntry`, `GameQuestion` types

## Implementation Phases

Because this spans data, admin, and public surfaces, suggested phasing for the implementation plan:

1. **Schema + import** — both migrations + the import script + first successful import to dev. Validate that the data looks right via direct queries.
2. **Admin form** — big bro autocomplete + roster API + members POST changes
3. **Game page + APIs** — the public game itself
4. **Leaderboard polish** — admin cleanup tool, inline top-3 on home page

Each phase is independently shippable behind a feature gate (a settings-table boolean `game_enabled`) so the game page can be hidden until step 3 is done and polished.

## Testing / Verification

No automated tests (matches existing codebase). Manual checklist:

**Import:**
1. Run script in dev, verify row count matches expected (~1390 with valid data, ~1300+ with big bro link, flagged exceptions listed)
2. Spot-check 5 random members against the PDF
3. Verify self-reference cases (1182, etc.) inserted with `big_brother_roll = null`

**Admin form:**
4. As owner: add a new member with a big bro picked from autocomplete → verify both `members` row and `chapter_roster` row created with FK
5. Add another member with same roll # as an existing roster entry → verify roster row UPDATED, not duplicated
6. Add a new member without a big bro → still works, roster row gets null
7. As admin (read-only role): autocomplete endpoint returns 403

**Game:**
8. Visit `/game`, enter username, start
9. Confirm question rotation alternates bigbro / roll (random order, not strict alternation)
10. Get one wrong on purpose, watch lives decrement; get to 0, game ends
11. Complete a perfect run, watch the queue empty and game end cleanly
12. Verify score posts to leaderboard, rank returned correctly
13. Refresh home page → new top-3 reflects new entry
14. As owner: clear leaderboard from admin → public leaderboard empties

**Anti-cheat sanity:**
15. POST `/api/game/score` with `{score: 9999, time_seconds: 1, username: "test"}` → 400 rejected
16. POST with `username: "<script>alert(1)</script>"` → 400 rejected (charset violation)

## Open Items / Future Work

- **Family tree visualization** — the chapter_roster data now in DB makes a Tinder-for-fraternity-lineage view feasible. Out of scope here.
- **Per-class difficulty modes** — "1990s only", "Founders era only" etc. Easy to add via a filter on the question pool. Skip for v1.
- **Sound effects** on correct/wrong. Nice polish but not blocking.
- **Mobile UX** — design works on mobile but should be specifically tested. Game is text-heavy so should be fine.
- **Profanity filter** — if any chapter member exploits the open username field, add a server-side blocklist as a fast-follow.
- **Real leaderboard reset cadence** — currently manual. Could add a "reset every quarter" cron if it becomes desired.
