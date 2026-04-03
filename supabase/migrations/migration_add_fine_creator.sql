-- Add created_by_user_id to fines table to track which admin created each fine
ALTER TABLE public.fines
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
