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
