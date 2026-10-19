-- Archive of soc pro entries that have ended. Removing someone from soc pro still deletes the
-- live social_probation row (lift, end date passed, fines resolved, annual cleanup), but a copy
-- lands here first so there's a history to view and export.
-- member_name is a snapshot so history survives the member being deleted.
-- Only reached through service-role API routes, so RLS is on with no policies.
CREATE TABLE IF NOT EXISTS public.social_probation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  member_name text NOT NULL,
  reason text NOT NULL,
  notes text,
  start_date date NOT NULL,
  end_date date,
  source text NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  removed_by text NOT NULL,
  removal_reason text NOT NULL
);

CREATE INDEX IF NOT EXISTS social_probation_history_removed_at_idx
  ON public.social_probation_history (removed_at DESC);

ALTER TABLE public.social_probation_history ENABLE ROW LEVEL SECURITY;
