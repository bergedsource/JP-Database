-- The trivia game is gone from the site; drop its tables and setting.
-- chapter_roster is NOT game-only (Roster sync uses it) — keep it.
drop view if exists public.public_game_leaderboard;
drop table if exists public.game_leaderboard;
drop table if exists public.chapter_trivia;
delete from public.settings where key = 'game_enabled';
