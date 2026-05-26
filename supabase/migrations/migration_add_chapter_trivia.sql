-- Anti-cheat trap questions: chapter trivia mixed into game runs.
-- Wrong answers don't deduct score or lives; they silently flag the run
-- for admin review. The premise: a brother looking up answers in the
-- master roster sheet can't find chapter trivia there, so a high rate
-- of trap failures is a behavioral cheating signal.

CREATE TABLE IF NOT EXISTS chapter_trivia (
  id              SERIAL PRIMARY KEY,
  question_text   TEXT NOT NULL,
  option_a        TEXT NOT NULL,
  option_b        TEXT NOT NULL,
  option_c        TEXT NOT NULL,
  option_d        TEXT NOT NULL,
  correct_index   SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT
);

-- Flag added to leaderboard rows whose run failed >=1 trap question.
ALTER TABLE game_leaderboard
  ADD COLUMN IF NOT EXISTS flagged_suspect BOOLEAN NOT NULL DEFAULT FALSE;
