-- Custom fine types added by admins
CREATE TABLE IF NOT EXISTS public.custom_fine_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bylaw_number text NOT NULL,
  default_amount numeric(10,2),
  description text,
  created_at timestamptz DEFAULT now()
);

-- Only admins can manage this table (service role used from API)
ALTER TABLE public.custom_fine_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read custom fine types"
  ON public.custom_fine_types FOR SELECT
  TO authenticated
  USING (true);
