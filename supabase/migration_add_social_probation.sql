create table public.social_probation (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  reason text not null check (reason in (
    'Outstanding Fines (§10-270)',
    'Academic - GPA Below 3.0 (§14-020)',
    'Academic - Cumulative GPA Below 2.0 (§14-060)',
    'Financial - Unpaid Dues (§9-140)',
    'Failure to Attend Ritual (§15-010)',
    'Failure to Complete Service Hours (§16-010)',
    'Missing House Philanthropy Event (§11-270)',
    'Other'
  )),
  notes text,
  start_date date not null default current_date,
  end_date date,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  created_at timestamptz not null default now()
);

alter table public.social_probation enable row level security;

create policy "Public can read social_probation" on public.social_probation
  for select using (true);

create policy "Authenticated can manage social_probation" on public.social_probation
  for all using (auth.role() = 'authenticated');
