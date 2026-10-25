-- migration_add_jp_tickets.sql
-- JP ticket queue (2026-10-25). Run in the Supabase SQL Editor BEFORE deploying the
-- code that uses it (the ticket routes 500 until this table exists; everything else
-- keeps working).
--
-- One row per brother per JP night:
--   * a brother "takes a ticket" from the homepage with his phone number, or
--   * the JP Chair skips a brother who isn't there (row with no phone, source 'chair').
--
-- Phone numbers are personal data: RLS on with NO policies, so only the service role
-- (server routes) can read or write. They're never in a public view, are cleared when
-- the session closes, and the daily cron deletes rows older than two days.

begin;

create table if not exists public.jp_tickets (
  id            uuid primary key default gen_random_uuid(),
  session_date  date not null,                 -- the JP night this ticket is for
  member_id     uuid not null references public.members(id) on delete cascade,
  ticket_no     int,                           -- 1, 2, 3… in order taken (null for chair-created rows)
  phone         text,                          -- E.164 (+15415551234); null for chair rows or after close
  token_hash    text,                          -- sha256 of the secret in the ticket link
  source        text not null default 'member' check (source in ('member', 'chair')),
  status        text not null default 'waiting'
                check (status in ('waiting', 'here', 'called', 'done', 'skipped', 'cancelled')),
  created_at    timestamptz not null default now(),
  called_at     timestamptz,
  done_at       timestamptz,
  requeued      boolean not null default false, -- came back after his spot passed: heard at the end of his officer group
  unique (session_date, member_id)
);

create index if not exists jp_tickets_date_idx on public.jp_tickets(session_date, status);
create unique index if not exists jp_tickets_token_idx on public.jp_tickets(token_hash) where token_hash is not null;

alter table public.jp_tickets enable row level security;
-- No policies on purpose: deny all to anon/authenticated.
revoke all on public.jp_tickets from anon, authenticated;

commit;
