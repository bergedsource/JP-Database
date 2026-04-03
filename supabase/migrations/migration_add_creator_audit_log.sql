-- Create creator_audit_logs table — only visible to the creator role
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.creator_audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email text NOT NULL,
  action text NOT NULL,
  details text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.creator_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only users with creator role can SELECT
CREATE POLICY "creator_can_read_creator_logs" ON public.creator_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND role = 'creator'
    )
  );

-- Only users with creator role can INSERT
CREATE POLICY "creator_can_insert_creator_logs" ON public.creator_audit_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND role = 'creator'
    )
  );
