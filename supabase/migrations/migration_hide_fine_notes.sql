-- migration_hide_fine_notes.sql
-- Private fine notes (2026-10-25). Run in the Supabase SQL Editor AFTER the
-- matching deploy (PR "hide fine notes from view-only admins") is live —
-- the old dashboard code reads fines with select("*"), which this would break.
--
-- The admin dashboard reads `fines` straight from the browser as the logged-in
-- user, so hiding notes in the UI alone isn't enough: a view-only admin could
-- still ask the database for them. This takes away direct read access to the
-- `notes` column for every logged-in user. Owners/root now get notes through
-- /api/admin/fines/notes (service role, owner-only); JP session detail strips
-- notes for view-only admins server-side.
--
-- If you ever add a column to `fines`, re-run this so the new column is granted
-- (and add it to FINE_COLUMNS in app/admin/page.tsx).
-- Idempotent: safe to re-run.

begin;

revoke select on public.fines from anon, authenticated;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'fines' and column_name <> 'notes';
  execute format('grant select (%s) on public.fines to authenticated', cols);
end $$;

commit;

-- Check (should list every fines column except notes):
-- select column_name from information_schema.column_privileges
--  where table_name = 'fines' and grantee = 'authenticated' and privilege_type = 'SELECT';
