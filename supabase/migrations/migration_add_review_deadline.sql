-- Pending fines are no longer auto-upheld after 2 weeks; they're flagged overdue in the admin UI instead.
-- review_deadline overrides the default deadline (created_at + 14 days) when an owner grants a +1 week extension.
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS review_deadline timestamptz;
