# Unbecomings Admin Tab — Design

## Problem

The chapter currently has no place to record formal disciplinary actions ("Unbecomings") against brothers. Fines work for routine financial penalties, but more serious conduct charges need their own home: longer write-ups, structured decision/sanction fields, file attachments (incident reports, hearing notes), and tighter access control. Storing them in fines or audit logs would either leak sensitive content to the `admin` role or mix structurally different data.

## Goal

A new "Unbecomings" tab in the admin portal that is:
- Invisible to the `admin` role at every layer (UI, API, DB)
- Visible to `owner` and `root` only, behind a password re-prompt
- Capable of storing per-incident text write-ups plus file attachments
- Pseudonymously audit-logged so a compromise of the admin role can't reveal the *contents* of an Unbecoming, only that one occurred

## Non-Goals

- Multi-respondent incidents (each record = exactly one brother; group infractions become N separate records)
- File preview / PDF rendering in-app (downloads only)
- Virus scanning of uploads
- Approval workflow with named hearing members or required quorum
- Email notifications to the respondent
- Bulk import / CSV upload
- Statuses beyond `pending / upheld / dismissed`
- Linking an Unbecoming to an existing fine record

## Approach

A standalone module: new tables, new private Storage bucket, new API routes, new tab component. Reuses existing infrastructure (`requireOwner()`, `createServiceClient()`, the `members` FK pattern, the existing `audit_logs` / `system_events` split) but does NOT bolt onto fines.

## Data Model

### `unbecomings` table

```sql
CREATE TABLE unbecomings (
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
  created_by      TEXT NOT NULL,           -- admin_email
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      TEXT NOT NULL            -- admin_email
);

CREATE INDEX idx_unbecomings_member_id ON unbecomings(member_id);
CREATE INDEX idx_unbecomings_status ON unbecomings(status);
CREATE INDEX idx_unbecomings_incident_date ON unbecomings(incident_date DESC);

ALTER TABLE unbecomings ENABLE ROW LEVEL SECURITY;
-- No policies = deny all; only service-role client can read/write.
```

### `unbecoming_attachments` table

```sql
CREATE TABLE unbecoming_attachments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unbecoming_id    UUID NOT NULL REFERENCES unbecomings(id) ON DELETE CASCADE,
  file_path        TEXT NOT NULL,            -- path within the 'unbecomings' bucket
  file_name        TEXT NOT NULL,            -- original filename for display
  file_size_bytes  BIGINT NOT NULL,
  mime_type        TEXT,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by      TEXT NOT NULL             -- admin_email
);

CREATE INDEX idx_unbecoming_attachments_unbecoming_id ON unbecoming_attachments(unbecoming_id);

ALTER TABLE unbecoming_attachments ENABLE ROW LEVEL SECURITY;
-- No policies = deny all; only service-role client can read/write.
```

### Storage bucket

- Name: `unbecomings`
- Public: `false`
- Path convention: `<unbecoming_id>/<random-uuid>-<sanitized-filename>`
  - `random-uuid` prefix prevents path-guessing if someone obtains a bucket id
  - Sanitization: strip path separators, replace whitespace with `_`, drop control chars
- No public read policy. Service-role client mints 60-second signed URLs on demand for downloads.
- Cascade on unbecoming delete: API route walks `unbecoming_attachments` rows BEFORE deleting the unbecoming, removes storage objects, then deletes the row (FK CASCADE handles the attachment rows).

## Auth & Lock Flow

### Tab visibility

Rendered only when `userRole === "owner" || userRole === "root"`. The admin page already passes `userRole` to tabs (mirrors how `SocialProbationTab`'s lift button is conditionally rendered). For `admin` role users, the tab does not appear in the tab strip at all.

### Password gate (the "lock")

The tab content is initially `<UnbecomingsLock>`, a password prompt component. The user enters their Supabase account password and submits. The client POSTs to `/api/admin/unlock` with `{ password }`.

Server logic:
1. `requireOwner()` + role check (`owner` or `root`)
2. Get the user's email from the existing session
3. Create an **ephemeral** Supabase client using the anon key (NOT the user's cookie-based session client)
4. Call `ephemeral.auth.signInWithPassword({ email, password })`
5. Discard the resulting tokens — the user's existing session cookies are untouched
6. Return `{ ok: true }` on success, `{ error: "Wrong password" }` on failure

On success, the React tab component flips an `unlocked` state to `true` and renders the real Unbecomings UI. The unlock is held in component state only — refreshing the page, switching to another admin tab, or closing the browser tab all require re-entry. No sessionStorage, no localStorage, no JWT.

**Why this is safe enough:** The unlock state is a UI gate, not the security boundary. Every API route still enforces `requireOwner()` + role check. A malicious client could in theory call the API routes directly without ever passing the lock — but they can't, because they'd need an active session that's already owner/root. The lock adds a second human-knowledge factor on top of session-stealing scenarios.

## API Routes

All routes under `/api/admin/unbecomings/` (and the unlock route).

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/unlock` | POST | Verify caller's password (used by lock screen) |
| `/api/admin/unbecomings` | GET | List Unbecomings (joined with member name for table display) |
| `/api/admin/unbecomings` | POST | Create new Unbecoming |
| `/api/admin/unbecomings/[id]` | GET | Detail including attachment list |
| `/api/admin/unbecomings/[id]` | PUT | Update fields |
| `/api/admin/unbecomings/[id]` | DELETE | Delete record + cascade attachments + storage objects |
| `/api/admin/unbecomings/[id]/attachments` | POST | Upload one file (multipart form data) |
| `/api/admin/unbecomings/[id]/attachments/[aid]/download` | GET | Returns `{ url: <signed-url-60s> }` |
| `/api/admin/unbecomings/[id]/attachments/[aid]` | DELETE | Delete attachment row + storage object |

### Common auth pattern (every route)

```ts
const denied = await requireOwner();
if (denied) return denied;
const current = await getCurrentRole();
if (!current || (current.role !== "owner" && current.role !== "root")) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}
```

### Validation rules

- `member_id`: UUID format, must exist in `members`
- `incident_date`, `decision_date`: ISO date `YYYY-MM-DD` if provided
- `title`: 1–200 chars after trim, required on create
- `body`: ≤ 50,000 chars (generous; matches a multi-page write-up)
- `status`: one of `pending`, `upheld`, `dismissed`
- `decision`, `sanction`: ≤ 5,000 chars, nullable
- Attachment upload:
  - File size ≤ 50 MB (Supabase Storage default)
  - Filename sanitized server-side
  - Mime type captured but not whitelisted (a JP officer might legitimately upload anything)

### Audit logging

Every create / update / delete / attachment-add / attachment-delete writes a row to `audit_logs` (or `system_events` if `current.role === "root"`):

```ts
await service.from(table).insert({
  admin_email: current.email,
  action: "Unbecoming created",            // or "Unbecoming updated" / "Unbecoming deleted" / etc.
  details: "",                              // intentionally empty — no member name, no record ID
});
```

The action vocabulary:
- `"Unbecoming created"`
- `"Unbecoming updated"`
- `"Unbecoming deleted"`
- `"Unbecoming attachment added"`
- `"Unbecoming attachment deleted"`

The admin role's audit tab can see these rows (tamper-detection) but cannot tell which brother or what record. Together with the role-gated table reads, this satisfies the "recorded but not with the name" requirement.

## UI

### File: `app/admin/components/UnbecomingsTab.tsx`

```
┌─ UnbecomingsTab (root component) ────────────────────────────┐
│                                                              │
│   if (!unlocked) → <UnbecomingsLock onUnlock={...} />        │
│   else           → <UnbecomingsContent />                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### `<UnbecomingsLock>`

- Centered card with a lock icon + heading "Restricted Area"
- Subtitle: "Re-enter your password to access Unbecomings."
- Single password input + Submit button
- On submit: POST `/api/admin/unlock`; on success call `onUnlock()`; on failure show inline error
- Enter key submits

### `<UnbecomingsContent>`

Top-level structure:
- "Add Unbecoming" button (top-right, brass-plaque style matching existing add-buttons)
- Filter row: search by member name, status dropdown
- Table:
  - Columns: Member, Incident Date, Title, Status, # Files, Updated
  - Row click expands inline into the detail view (similar to how the JP Sessions tab handles per-session detail)

### Detail view (inline expand below the row)

- Read mode by default: all fields displayed
- "Edit" button flips to edit mode (form inputs for every field)
- "Files" section: list of attachments with size, uploaded-by, and a Download button per file + Delete button (with confirm)
- "Upload" input below the list to add new files (one at a time, drag-or-click)
- "Save" / "Cancel" / "Delete Record" buttons in edit mode

### Add form

- Same fields as detail edit mode, on an empty record
- Member picker: autocomplete reusing the existing `<MemberAutocomplete>` pattern from FinesTab
- After create: returns the new id, caller can immediately attach files

## Tab Integration

`app/admin/page.tsx`:
- Add `"unbecomings"` to the tab list
- Conditionally render the tab button only when `userRole === "owner" || userRole === "root"`
- Add `case "unbecomings": return <UnbecomingsTab userRole={userRole} />;` to the tab body switch

## Migration

**File:** `supabase/migrations/migration_add_unbecomings.sql`

Contains both `CREATE TABLE` statements (above) plus:
```sql
-- Storage bucket creation (run via Supabase dashboard OR programmatically):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('unbecomings', 'unbecomings', false);
```

Idempotent — uses `IF NOT EXISTS` on indexes; tables themselves will fail loudly if already exist (intentional — first-run flag).

**Storage bucket** is created via a one-time script (`scripts/setup-unbecomings-bucket.ts`) that calls `service.storage.createBucket('unbecomings', { public: false, fileSizeLimit: 52428800 })`. Idempotent (catches "bucket already exists" error).

## Types

Add to `lib/types.ts`:

```ts
export interface Unbecoming {
  id: string;
  member_id: string;
  member_name?: string;          // populated via JOIN at query time, not stored
  incident_date: string;
  title: string;
  body: string;
  status: "pending" | "upheld" | "dismissed";
  decision: string | null;
  decision_date: string | null;
  sanction: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  attachments?: UnbecomingAttachment[];
}

export interface UnbecomingAttachment {
  id: string;
  unbecoming_id: string;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string | null;
  uploaded_at: string;
  uploaded_by: string;
}
```

## Permissions Matrix

| Action | admin | owner | root |
|---|---|---|---|
| See tab | No | Yes | Yes |
| Unlock without password | No | No | No |
| Read records | No | After unlock | After unlock |
| Create / update / delete records | No | Yes | Yes |
| Upload / delete attachments | No | Yes | Yes |
| Download attachments | No | Yes | Yes |
| See pseudonymous audit entries | Yes (in Audit tab) | Yes | Yes (in system_events) |

## Known Future Work

- Multi-respondent incidents (group infractions create N separate records today — fine for now)
- File previews / inline PDF rendering
- Virus / mime-type validation on uploads
- Notify-the-brother flow (email + acknowledge link)
- Auto-archive of dismissed records after N years
