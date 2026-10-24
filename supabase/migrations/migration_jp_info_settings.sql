-- migration_jp_info_settings.sql
-- Homepage JP card (2026-10-24). Run in the Supabase SQL Editor.
--
-- Adds the two settings the public homepage now reads to the curated
-- `public_settings` view:
--   next_jp_session     — {"date","time","place"} the chair posts for the next session
--   jp_hearing_minutes  — minutes per fine tier, used for each brother's wait estimate
--
-- Order doesn't matter: until this runs, the homepage shows "not scheduled yet" and
-- the default hearing times; nothing errors. Same grants as before (service role
-- only — anon/authenticated stay locked out). Idempotent: safe to re-run.

begin;

drop view if exists public.public_settings;
create view public.public_settings
  with (security_invoker = false) as
  select key, value
  from public.settings
  where key in ('venmo_handle', 'venmo_url', 'game_enabled', 'next_jp_session', 'jp_hearing_minutes');

revoke all on public.public_settings from anon, authenticated, public;
grant select on public.public_settings to service_role;

commit;
