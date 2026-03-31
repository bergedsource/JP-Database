-- Run this in Supabase SQL Editor to add 'inactive' as a valid member status
ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_status_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_status_check
  CHECK (status IN ('active', 'pledge', 'live-out', 'alumni', 'inactive'));
