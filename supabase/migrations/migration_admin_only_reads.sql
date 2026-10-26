-- Route auth audit (2026-10-26), items D1–D3.
--
-- D1: the dashboard's read policies were `to authenticated using (true)`, so ANY
--     Supabase account (e.g. a stranger who signs up with the public anon key)
--     could read fines, members, audit logs, soc pro and JP sessions. Restrict
--     them to accounts that have an admin_roles row. Also turn OFF
--     "Allow new users to sign up" and "Allow anonymous sign-ins" in
--     Authentication → Sign In / Providers.
-- D2/D3: no migration enabled RLS on `settings` (holds the public Venmo link and
--     next JP session) or `chapter_roster`. Every app read/write of these goes
--     through the service role, so lock them to it.
--
-- Idempotent; safe to re-run. Run in the Supabase SQL editor.

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_roles where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- D1: admin-only reads ──────────────────────────────────────────────────────
drop policy if exists "fines_authenticated_select" on public.fines;
create policy "fines_authenticated_select" on public.fines
  for select to authenticated using (public.is_admin());

drop policy if exists "members_authenticated_select" on public.members;
create policy "members_authenticated_select" on public.members
  for select to authenticated using (public.is_admin());

drop policy if exists "audit_logs_authenticated_select" on public.audit_logs;
create policy "audit_logs_authenticated_select" on public.audit_logs
  for select to authenticated using (public.is_admin());

drop policy if exists "social_probation_authenticated_select" on public.social_probation;
create policy "social_probation_authenticated_select" on public.social_probation
  for select to authenticated using (public.is_admin());

drop policy if exists "authenticated_read_jp_sessions" on public.jp_sessions;
create policy "authenticated_read_jp_sessions" on public.jp_sessions
  for select to authenticated using (public.is_admin());

drop policy if exists "authenticated_read_jp_session_fines" on public.jp_session_fines;
create policy "authenticated_read_jp_session_fines" on public.jp_session_fines
  for select to authenticated using (public.is_admin());

drop policy if exists "authenticated_read_jp_session_changes" on public.jp_session_changes;
create policy "authenticated_read_jp_session_changes" on public.jp_session_changes
  for select to authenticated using (public.is_admin());

-- D2/D3: service-role only ──────────────────────────────────────────────────
alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;

alter table public.chapter_roster enable row level security;
revoke all on public.chapter_roster from anon, authenticated;

-- N1 cleanup: soc pro rows that got a private fine note copied in when the fine
-- was issued with "place on soc pro" (code no longer copies it).
update public.social_probation sp
set notes = null
where sp.notes is not null
  and exists (
    select 1 from public.fines f
    where f.member_id = sp.member_id and f.notes = sp.notes
  );
update public.social_probation_history h
set notes = null
where h.notes is not null
  and exists (
    select 1 from public.fines f
    where f.member_id = h.member_id and f.notes = h.notes
  );

commit;

-- Verify (should list is_admin() in every qual, and relrowsecurity = t):
-- select tablename, policyname, qual from pg_policies where schemaname = 'public' order by 1;
-- select relname, relrowsecurity from pg_class where oid in ('public.settings'::regclass, 'public.chapter_roster'::regclass);
