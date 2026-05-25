-- Unbecomings: disciplinary records for brothers, owner+root only.
-- See docs/superpowers/specs/2026-05-24-unbecomings-admin-tab-design.md
--
-- Two tables + a private Supabase Storage bucket (created via
-- scripts/setup-unbecomings-bucket.ts).
--
-- Both tables have RLS enabled with NO policies — only the service-role
-- client (used by /api/admin/unbecomings/* routes) can read or write.

CREATE TABLE IF NOT EXISTS unbecomings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  incident_date   DATE NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL CHECK (status IN ('pending', 'upheld', 'dismissed')) DEFAULT 'pending',
  decision        TEXT,
  decision_date   DATE,
  sanction        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unbecomings_member_id ON unbecomings(member_id);
CREATE INDEX IF NOT EXISTS idx_unbecomings_status ON unbecomings(status);
CREATE INDEX IF NOT EXISTS idx_unbecomings_incident_date ON unbecomings(incident_date DESC);

ALTER TABLE unbecomings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS unbecoming_attachments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unbecoming_id    UUID NOT NULL REFERENCES unbecomings(id) ON DELETE CASCADE,
  file_path        TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  file_size_bytes  BIGINT NOT NULL,
  mime_type        TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unbecoming_attachments_unbecoming_id ON unbecoming_attachments(unbecoming_id);

ALTER TABLE unbecoming_attachments ENABLE ROW LEVEL SECURITY;
