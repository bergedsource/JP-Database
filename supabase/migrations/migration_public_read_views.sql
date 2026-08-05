-- migration_public_read_views.sql
-- Security review remediation (2026-08-05). Run in the Supabase SQL Editor
-- BEFORE deploying the code change that points the public read routes at these
-- views. Applying it early is safe: the views just sit unused until the new code
-- ships. Deploying the code FIRST would 500 those routes (the views won't exist).
--
-- Background: the public read endpoints (/api/members, /api/search,
-- /api/member-fines/[id], /api/settings, /api/game/leaderboard) run under the
-- service-role key, which bypasses RLS entirely. That means the ONLY thing
-- keeping a public response from exposing, say, fines.notes was the exact column
-- list hand-written in each route. Any future over-broad select silently becomes
-- a data leak — the finding this migration addresses.
--
-- Fix: move the public column/row allowlist out of the route code and into the
-- database as curated VIEWS. Each view projects only the columns and rows the
-- public site may see; the routes then read the view instead of the base table.
-- Because the view has no `notes` column at all (etc.), a widened select in a
-- route simply cannot reach it — the schema is the backstop.
--
-- Deliberately NOT re-granting anything to `anon`: migration_harden_rls_security
-- .sql removed all anon DB access so public data can't be scraped straight from
-- PostgREST, bypassing the app's rate limiter. These views preserve that — only
-- the service role (used by the server routes, behind rate limiting) can read
-- them. anon/authenticated stay locked out.
--
-- security_invoker = false so each view reads its RLS-protected base table with
-- the owner's rights. Idempotent: safe to re-run.

begin;

-- 1) public_members ─────────────────────────────────────────────────────────
-- Public roster + name search: active/pledge members, non-sensitive columns.
drop view if exists public.public_members;
create view public.public_members
  with (security_invoker = false) as
  select id, name, status, roll
  from public.members
  where status in ('active', 'pledge');

revoke all on public.public_members from anon, authenticated, public;
grant select on public.public_members to service_role;

-- 2) public_member_fines ────────────────────────────────────────────────────
-- Public fine lookup: every column the tracker shows EXCEPT `notes` (private
-- disciplinary detail), which is absent from the view and thus unreachable.
drop view if exists public.public_member_fines;
create view public.public_member_fines
  with (security_invoker = false) as
  select id, member_id, fine_type, description, amount, status, term,
         date_issued, date_resolved, fining_officer, created_at
  from public.fines;

revoke all on public.public_member_fines from anon, authenticated, public;
grant select on public.public_member_fines to service_role;

-- 3) public_settings ────────────────────────────────────────────────────────
-- Only the three keys the public page reads; every other settings row (API
-- config, export history, spreadsheet ids, ...) is excluded.
drop view if exists public.public_settings;
create view public.public_settings
  with (security_invoker = false) as
  select key, value
  from public.settings
  where key in ('venmo_handle', 'venmo_url', 'game_enabled');

revoke all on public.public_settings from anon, authenticated, public;
grant select on public.public_settings to service_role;

-- 4) public_game_leaderboard ────────────────────────────────────────────────
-- Public top-scores board: non-flagged entries, safe columns only. The
-- anti-cheat flag and per-run trivia stats stay out of the public projection.
drop view if exists public.public_game_leaderboard;
create view public.public_game_leaderboard
  with (security_invoker = false) as
  select id, username, score, time_seconds, created_at
  from public.game_leaderboard
  where flagged_suspect = false;

revoke all on public.public_game_leaderboard from anon, authenticated, public;
grant select on public.public_game_leaderboard to service_role;

commit;

-- ── Post-run verification (optional) ───────────────────────────────────────
-- Only service_role should hold privileges on the public_* views:
--   select table_name, privilege_type, grantee
--   from information_schema.role_table_grants
--   where table_name like 'public\_%' order by table_name, grantee;
--
-- anon/authenticated should return NO rows above; if any appear, re-run the
-- matching REVOKE. The views must exist before the app deploy that reads them.
