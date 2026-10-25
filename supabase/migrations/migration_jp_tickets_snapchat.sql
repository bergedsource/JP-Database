-- migration_jp_tickets_snapchat.sql
-- JP tickets: contact by Snapchat instead of phone (2026-10-25). Run in the Supabase
-- SQL Editor after migration_add_jp_tickets.sql.
--
-- A ticket has either `phone` or `snapchat` (a Snapchat username). Cleared together
-- with the phone number (cancel / session close / cron). Idempotent: safe to re-run.

alter table public.jp_tickets add column if not exists snapchat text;
