-- Trivia scoring pivot (2026-05-26 evening): trivia now counts for points and deducts lives.
-- The "flagged_suspect" detection moves from per-run (any wrong trap = flag) to lifetime
-- aggregate (<40% trivia success across 3+ runs by the same username = flag). Requires
-- storing per-run trivia stats so /score can compute the aggregate.

ALTER TABLE game_leaderboard
  ADD COLUMN IF NOT EXISTS trivia_attempted SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trivia_correct   SMALLINT NOT NULL DEFAULT 0;

-- Sanity bounds: can't get more correct than attempted, both non-negative.
ALTER TABLE game_leaderboard
  ADD CONSTRAINT trivia_correct_le_attempted CHECK (trivia_correct <= trivia_attempted),
  ADD CONSTRAINT trivia_attempted_nonneg CHECK (trivia_attempted >= 0),
  ADD CONSTRAINT trivia_correct_nonneg CHECK (trivia_correct >= 0);
