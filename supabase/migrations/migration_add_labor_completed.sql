-- Track when a member finishes the labor assigned in place of a monetary fine.
-- NULL on a status='labor' fine = labor still owed (shown in the Outstanding tab's labor list).
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS labor_completed_at date;
