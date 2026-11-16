-- Tickets were removed from the site (members found them confusing).
-- Drops the tickets table (and every stored phone number) plus the settings that
-- only tickets / wait estimates used.
drop table if exists public.jp_push_subscriptions;
drop table if exists public.jp_tickets;
delete from public.settings where key in ('jp_status_note', 'jp_hearing_minutes');
