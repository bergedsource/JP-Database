-- One-time cleanup for the "Labor not completed" soc pro bug: the cron added an
-- auto §10-270 row next to the manual one. Drop the auto duplicate; the cron now
-- treats the manual row as the brother's soc pro and lifts it once he's paid up.
-- Safe to run more than once.
delete from public.social_probation a
where a.source = 'auto'
  and a.reason = 'Outstanding Fines (§10-270)'
  and a.end_date is null
  and exists (
    select 1 from public.social_probation m
    where m.member_id = a.member_id
      and m.source = 'manual'
      and m.reason = 'Outstanding Fines (§10-270)'
      and m.end_date is null
  )
returning a.member_id;
