-- JP Sessions: tracks JP Committee meeting sessions
CREATE TABLE IF NOT EXISTS public.jp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_held date NOT NULL,
  closed_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_jp_sessions"
  ON public.jp_sessions FOR SELECT
  USING (auth.role() = 'authenticated');

-- jp_session_fines: snapshot of which pending fines were in each session
CREATE TABLE IF NOT EXISTS public.jp_session_fines (
  session_id uuid NOT NULL REFERENCES public.jp_sessions(id) ON DELETE CASCADE,
  fine_id uuid NOT NULL REFERENCES public.fines(id) ON DELETE CASCADE,
  snapshot_status text NOT NULL DEFAULT 'pending',
  PRIMARY KEY (session_id, fine_id)
);

ALTER TABLE public.jp_session_fines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_jp_session_fines"
  ON public.jp_session_fines FOR SELECT
  USING (auth.role() = 'authenticated');

-- jp_session_changes: log of every status change made during a session
CREATE TABLE IF NOT EXISTS public.jp_session_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.jp_sessions(id) ON DELETE CASCADE,
  fine_id uuid NOT NULL REFERENCES public.fines(id) ON DELETE CASCADE,
  changed_by_user_id uuid NOT NULL,
  changed_by_email text NOT NULL,
  old_status text NOT NULL,
  new_status text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jp_session_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_jp_session_changes"
  ON public.jp_session_changes FOR SELECT
  USING (auth.role() = 'authenticated');
