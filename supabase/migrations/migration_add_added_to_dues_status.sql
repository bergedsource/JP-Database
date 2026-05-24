ALTER TABLE public.fines
  DROP CONSTRAINT IF EXISTS fines_status_check;

ALTER TABLE public.fines
  ADD CONSTRAINT fines_status_check
  CHECK (status IN ('pending', 'upheld', 'dismissed', 'paid', 'labor', 'overturned', 'added_to_dues'));
