-- Rename creator role to root, rename creator_audit_logs to system_events
-- Run each step separately in the Supabase SQL Editor

-- STEP 1: Drop the old check constraint
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.admin_roles'::regclass AND contype = 'c';
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_roles DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

-- STEP 2: Update role value BEFORE adding new constraint
UPDATE public.admin_roles SET role = 'root' WHERE role = 'creator';

-- STEP 3: Add new constraint that includes 'root'
ALTER TABLE public.admin_roles
  ADD CONSTRAINT admin_roles_role_check
  CHECK (role IN ('owner', 'admin', 'root'));

-- STEP 4: Update the trigger function
CREATE OR REPLACE FUNCTION public.protect_creator_role()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'root' AND NEW.role != 'root' THEN
    RAISE EXCEPTION 'This role cannot be changed';
  END IF;
  IF OLD.role != 'root' AND NEW.role = 'root' THEN
    RAISE EXCEPTION 'This role cannot be assigned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 5: Rename table and fix RLS policies
ALTER TABLE IF EXISTS public.creator_audit_logs RENAME TO system_events;

DROP POLICY IF EXISTS "creator_can_read_creator_logs" ON public.system_events;
DROP POLICY IF EXISTS "creator_can_insert_creator_logs" ON public.system_events;

CREATE POLICY "root_can_read_system_events" ON public.system_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid() AND role = 'root')
  );

CREATE POLICY "root_can_insert_system_events" ON public.system_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid() AND role = 'root')
  );
