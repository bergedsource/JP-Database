-- migration_harden_rls_security.sql
-- Security review remediation (2026-06-09). Run in the Supabase SQL Editor.
--
-- Closes three classes of Row Level Security holes found in the review. The
-- common root cause: Supabase grants the `anon` and `authenticated` Postgres
-- roles full table access by default, so RLS policies are the ONLY thing
-- standing between a browser (which ships the anon key) and PostgREST. Several
-- tables had policies far more permissive than the application's own auth model.
--
--   1. admin_roles had NO row level security at all -> any authenticated user
--      could `update admin_roles set role='owner' where user_id=<self>` directly
--      via PostgREST and escalate from read-only admin to owner.
--
--   2. fines + members were world-readable (`using (true)` for anon). Anyone with
--      the public anon key could read EVERY fine — including the `notes` column
--      that the API deliberately withholds — bypassing rate limiting entirely.
--
--   3. fines, members, audit_logs, social_probation carried a `for all`
--      "authenticated can manage" policy. Any logged-in admin (even the
--      read-only `admin` role) could INSERT/UPDATE/DELETE any row directly via
--      PostgREST, bypassing requireOwner(), input validation, the $10k amount
--      cap, and audit logging — and could even forge or delete audit_logs rows.
--
-- Model after this migration: anon gets nothing; `authenticated` gets READ-only
-- where the dashboard needs it; ALL writes go through the service-role key in
-- server route handlers (service role bypasses RLS). No application write path
-- depends on any policy dropped here.
--
-- Verified safe against the codebase before writing:
--   * getCurrentRole() reads only the caller's OWN admin_roles row  -> self-select
--   * the admin dashboard reads members/fines/audit_logs with an authenticated
--     session (browser client)                                     -> authenticated select
--   * /api/members and /api/search are switched off the anon client to the
--     service client in the same change set
--   * social_probation / jp_sessions are never read by the browser client
--   * jp_sessions* are already correctly read-only (writes via service) — untouched
--
-- Idempotent: safe to re-run.

begin;

-- 1) admin_roles ───────────────────────────────────────────────────────────
-- Enable RLS and allow each admin to read ONLY their own row. No write policy:
-- role creation/transfer happens through the service-role key in
-- /api/admin/users and /api/admin/transfer. The protect_creator_role trigger
-- still guards the root row independently.
alter table public.admin_roles enable row level security;

drop policy if exists "admin_roles_self_select" on public.admin_roles;
create policy "admin_roles_self_select"
  on public.admin_roles for select
  to authenticated
  using (user_id = auth.uid());

-- 2) fines ─────────────────────────────────────────────────────────────────
-- Drop public (anon) read — this is what leaked `notes`. Drop the for-all
-- manage policy. Keep authenticated read for the admin dashboard.
drop policy if exists "Public can read fines" on public.fines;
drop policy if exists "Authenticated users can manage fines" on public.fines;

drop policy if exists "fines_authenticated_select" on public.fines;
create policy "fines_authenticated_select"
  on public.fines for select
  to authenticated
  using (true);

-- 3) members ───────────────────────────────────────────────────────────────
drop policy if exists "Public can read members" on public.members;
drop policy if exists "Authenticated users can manage members" on public.members;

drop policy if exists "members_authenticated_select" on public.members;
create policy "members_authenticated_select"
  on public.members for select
  to authenticated
  using (true);

-- 4) audit_logs ────────────────────────────────────────────────────────────
-- Read-only for authenticated (dashboard reads them); no writes via PostgREST,
-- so the audit trail can no longer be forged or wiped from the browser. The
-- cron + route handlers insert audit rows with the service-role key.
drop policy if exists "Authenticated users can manage audit logs" on public.audit_logs;

drop policy if exists "audit_logs_authenticated_select" on public.audit_logs;
create policy "audit_logs_authenticated_select"
  on public.audit_logs for select
  to authenticated
  using (true);

-- 5) social_probation ──────────────────────────────────────────────────────
-- Drop anon read + for-all manage (same class as fines/members). Authenticated
-- read kept; writes go through /api/admin/social-probation (service role).
drop policy if exists "Public can read social_probation" on public.social_probation;
drop policy if exists "Authenticated can manage social_probation" on public.social_probation;

drop policy if exists "social_probation_authenticated_select" on public.social_probation;
create policy "social_probation_authenticated_select"
  on public.social_probation for select
  to authenticated
  using (true);

commit;

-- ── Post-run verification (optional) ───────────────────────────────────────
-- Every public table should show rowsecurity = true:
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname;
--
-- admin_roles should have exactly one (self-select) policy and no write policy:
--   select polname, cmd from pg_policies where tablename = 'admin_roles';
