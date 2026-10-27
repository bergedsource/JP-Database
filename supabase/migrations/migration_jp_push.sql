-- Push alerts for JP tickets ("2 brothers ahead", "you're being called").
-- A ticket can have a subscription per device; they go away with the ticket
-- (tickets are deleted 2 days after the night). Service role only. Idempotent.
create table if not exists public.jp_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.jp_tickets(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (ticket_id, endpoint)
);
alter table public.jp_push_subscriptions enable row level security;
revoke all on public.jp_push_subscriptions from anon, authenticated;

-- "Almost up" is sent once per ticket.
alter table public.jp_tickets add column if not exists push_near_sent boolean not null default false;
