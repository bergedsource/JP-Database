-- Cut disk reads: indexes for the queries the ticket screen, queue and cron run most.
-- Safe to run more than once.
create index if not exists fines_status_idx on public.fines(status);
create index if not exists jp_session_changes_session_idx on public.jp_session_changes(session_id);
create index if not exists jp_sessions_open_idx on public.jp_sessions(date_held desc) where closed_at is null;
analyze public.fines;
analyze public.jp_session_changes;
analyze public.jp_sessions;
