-- Add fining_officer column to fines table
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS fining_officer text;
