-- migration_jp_tickets_proxy.sql
-- JP tickets: a brother can send a proxy (2026-10-25). Run in the Supabase SQL Editor
-- after migration_add_jp_tickets.sql.
--
-- When set, `phone` on the ticket is the PROXY's number, so the chair calls the
-- proxy. Cleared together with the phone number (cancel / session close / cron).
-- Idempotent: safe to re-run.

alter table public.jp_tickets add column if not exists proxy_name text;
