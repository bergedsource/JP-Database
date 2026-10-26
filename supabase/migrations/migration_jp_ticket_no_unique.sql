-- migration_jp_ticket_no_unique.sql
-- Ticket numbers (2026-10-26). Run in the Supabase SQL Editor.
--
-- Two brothers taking tickets at the same moment could both get the same number
-- (the API reads the highest number and adds one). This makes a duplicate number on
-- the same night impossible; the API retries with the next number when it collides.
-- Chair-created rows have no number (null) and are not affected.
-- Idempotent: safe to re-run.

create unique index if not exists jp_tickets_no_unique
  on public.jp_tickets (session_date, ticket_no)
  where ticket_no is not null;
