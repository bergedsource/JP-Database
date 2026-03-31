-- Run this in the Supabase SQL Editor to set up your database

-- Members table
create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'pledge', 'live-out', 'alumni')),
  created_at timestamptz not null default now()
);

-- Fines table
create table public.fines (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  fine_type text not null,
  description text not null,
  amount numeric(8, 2),
  status text not null default 'pending' check (status in ('pending', 'upheld', 'dismissed', 'paid', 'labor')),
  term text not null,
  date_issued date not null,
  date_resolved date,
  notes text,
  created_at timestamptz not null default now()
);

-- Index for fast member fine lookups
create index fines_member_id_idx on public.fines(member_id);

-- Row Level Security
alter table public.members enable row level security;
alter table public.fines enable row level security;

-- Members: anyone can read (for the public lookup page)
create policy "Public can read members"
  on public.members for select
  using (true);

-- Members: only authenticated users (JP Chair) can write
create policy "Authenticated users can manage members"
  on public.members for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Fines: anyone can read (for the public lookup page)
create policy "Public can read fines"
  on public.fines for select
  using (true);

-- Fines: only authenticated users (JP Chair) can write
create policy "Authenticated users can manage fines"
  on public.fines for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
