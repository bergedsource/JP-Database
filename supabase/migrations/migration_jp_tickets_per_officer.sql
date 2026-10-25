-- migration_jp_tickets_per_officer.sql
-- JP tickets are per fining-officer group (2026-10-25). Run in the Supabase SQL Editor
-- after the earlier jp_tickets migrations.
--
-- JP hears a brother once in each fining officer's group, so a ticket now belongs to
-- one officer's group. A brother may hold one ticket per officer per night; a second
-- ticket for the same brother + officer is refused. Chair rows (skip / here) have no
-- officer and stay one per brother (NULLS NOT DISTINCT).
-- Idempotent: safe to re-run.

begin;

alter table public.jp_tickets add column if not exists fining_officer text;

alter table public.jp_tickets drop constraint if exists jp_tickets_session_date_member_id_key;
alter table public.jp_tickets drop constraint if exists jp_tickets_one_per_officer;
alter table public.jp_tickets
  add constraint jp_tickets_one_per_officer unique nulls not distinct (session_date, member_id, fining_officer);

commit;
