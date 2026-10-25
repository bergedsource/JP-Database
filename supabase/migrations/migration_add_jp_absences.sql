-- migration_add_jp_absences.sql
-- JP no-shows (2026-10-25). Run in the Supabase SQL Editor before deploying.
--
-- When a JP session closes, every brother who still has an undecided fine from
-- that session is recorded as absent for that week (whether or not he was skipped).
-- His fine stays pending for the next session. Rows go away with their session
-- (ON DELETE CASCADE), so the Jan 4 wipe clears them too.
-- Idempotent: safe to re-run.

begin;

create table if not exists public.jp_absences (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.jp_sessions(id) on delete cascade,
  session_date  date not null,
  member_id     uuid not null references public.members(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (session_id, member_id)
);

create index if not exists jp_absences_member_idx on public.jp_absences(member_id);

alter table public.jp_absences enable row level security;
-- No policies: only the service role (admin routes) can read or write.
revoke all on public.jp_absences from anon, authenticated;

commit;
