-- Add creator role for bergedillon@gmail.com
-- Run this in the Supabase SQL Editor

-- Step 1: Drop existing CHECK constraint on admin_roles.role if one exists
-- (safe to run even if no constraint exists)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.admin_roles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_roles DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

-- Step 2: Add new CHECK constraint that includes 'creator'
ALTER TABLE public.admin_roles
  ADD CONSTRAINT admin_roles_role_check
  CHECK (role IN ('owner', 'admin', 'creator'));

-- Step 3: Insert creator row for bergedillon@gmail.com
-- Uses the existing auth.users entry; updates if already present
INSERT INTO public.admin_roles (user_id, role, email)
SELECT id, 'creator', email
FROM auth.users
WHERE email = 'bergedillon@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'creator';

-- Step 4: Add a trigger to prevent creator role from ever being changed
CREATE OR REPLACE FUNCTION public.protect_creator_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Block any UPDATE that would change a creator's role
  IF OLD.role = 'creator' AND NEW.role != 'creator' THEN
    RAISE EXCEPTION 'Creator role cannot be changed';
  END IF;
  -- Block any UPDATE that would assign creator role to a non-creator
  IF OLD.role != 'creator' AND NEW.role = 'creator' THEN
    RAISE EXCEPTION 'Creator role cannot be assigned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_creator_role_trigger ON public.admin_roles;
CREATE TRIGGER protect_creator_role_trigger
  BEFORE UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_creator_role();
