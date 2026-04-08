# JP Sessions Design

**Date:** 2026-04-07
**Feature:** JP Meeting Session Tracking
**Scope:** New admin tab for hosting and reviewing Jurisprudence Committee meetings

---

## Overview

A new "Sessions" tab on the admin side allows the JP Chair to create a session for each JP meeting, review and adjudicate all pending fines during that meeting, and store a record of every status change made during the session for later review. Sessions and all related records are wiped on January 4th along with the rest of the chapter's fine records.

---

## Database Schema

### `jp_sessions`
| column | type | notes |
|---|---|---|
| id | uuid | PK, auto (gen_random_uuid()) |
| date_held | date | the meeting date entered by the JP chair |
| closed_at | timestamptz | null = session open; set when JP chair closes session |
| created_at | timestamptz | auto (now()) |

### `jp_session_fines`
| column | type | notes |
|---|---|---|
| session_id | uuid | FK → jp_sessions(id) ON DELETE CASCADE |
| fine_id | uuid | FK → fines(id) ON DELETE CASCADE |
| snapshot_status | text | status of the fine at the moment the session was created |

Primary key: (session_id, fine_id)

### `jp_session_changes`
| column | type | notes |
|---|---|---|
| id | uuid | PK, auto (gen_random_uuid()) |
| session_id | uuid | FK → jp_sessions(id) ON DELETE CASCADE |
| fine_id | uuid | FK → fines(id) ON DELETE CASCADE |
| changed_by_user_id | uuid | Supabase auth user id |
| changed_by_email | text | stored directly — survives user deletion |
| old_status | text | |
| new_status | text | |
| changed_at | timestamptz | auto (now()) |

**RLS:** All three tables — authenticated users can SELECT, writes go through service role only (API routes). No direct client writes.

**Migration file:** `supabase/migrations/migration_add_jp_sessions.sql`

---

## API Routes

All routes under `/app/api/admin/sessions/`. All require at minimum `requireAuth()`. Write operations require `requireOwner()`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/sessions` | any admin | List all sessions: id, date_held, closed_at, fine_count |
| POST | `/api/admin/sessions` | owner/root | Create session; snapshot all currently pending fines into `jp_session_fines` |
| GET | `/api/admin/sessions/[id]` | any admin | Session detail: fines (joined with member name, fine fields) + changes log |
| POST | `/api/admin/sessions/[id]/close` | owner/root | Set `closed_at = now()` |
| POST | `/api/admin/sessions/[id]/update-fine` | owner/root | Update fine status in `fines` table, write row to `jp_session_changes`, write to `audit_logs` |

### Session creation logic (POST `/api/admin/sessions`)
1. Insert row into `jp_sessions` with `date_held` from request body
2. Query all fines where `status = 'pending'`
3. Insert one row per fine into `jp_session_fines` with `snapshot_status = 'pending'`
4. Return the new session id

### Fine status update logic (POST `/api/admin/sessions/[id]/update-fine`)
1. Verify session exists
2. Verify fine is in `jp_session_fines` for this session
3. If session is closed, still allow update (owner/root only — already gated by `requireOwner()`)
4. Update `fines.status` via service client
5. Insert row into `jp_session_changes` (old_status, new_status, changed_by_user_id, changed_by_email, changed_at)
6. Insert row into `audit_logs` (consistent with existing audit trail)
7. Return updated fine

---

## UI — Sessions Tab

### Tab placement
After "Audit", before "Transition". Visible to all admin roles. Tab label: **Sessions**.

### Sessions list view (default)
- **New Session** button — owner/root only. Opens inline form: date input (defaults to today) + "Start Session" submit button.
- Sessions listed newest first. Each row shows:
  - Date held (formatted: "April 7, 2026")
  - Fine count (e.g. "12 fines")
  - Status badge: `open` (gold) or `closed` (muted)
  - "View" button → navigates to session detail view

### Session detail view
Triggered by clicking "View" on a session row. Replaces the list view within the tab (back button returns to list).

**Header:**
- Date held + status badge
- Back button (returns to sessions list)
- "Close Session" button — owner/root only, only shown when session is open. Confirm prompt: "Close this session? Owner and root can still make changes after closing."

**Fines in this session** (card, same styling as Fines tab `adm-fine-row`):
- Shows all fines snapshotted into this session at creation time
- Displays: member name, fine type, description, fining officer, date issued, term, amount, current status
- Owner/root: status dropdown (same options as Fines tab) — selecting a new value calls `update-fine` route
- Admin role: status shown as plain text badge (read-only)
- If a fine was resolved after the session was created (e.g. paid), its current status reflects that

**Changes this session** (card below fines):
- Chronological list of all `jp_session_changes` rows for this session
- Each row: `"[Member Name] · [Fine Type] · [old] → [new] · by [email] · [time]"`
- If no changes yet: "No changes recorded yet."

---

## Role Summary

| Action | admin | owner | root |
|---|---|---|---|
| View sessions list | ✓ | ✓ | ✓ |
| View session detail | ✓ | ✓ | ✓ |
| Create session | ✗ | ✓ | ✓ |
| Close session | ✗ | ✓ | ✓ |
| Change fine status (open session) | ✗ | ✓ | ✓ |
| Change fine status (closed session) | ✗ | ✓ | ✓ |

---

## January 4th Cleanup (Cron)

Added to the existing Jan 4 cron logic in `/api/cron/route.ts`, in FK-safe order:

```sql
DELETE FROM jp_session_changes;
DELETE FROM jp_session_fines;
DELETE FROM jp_sessions;
```

These run alongside the existing `DELETE FROM fines` and related cleanup.

---

## Migration Deployment (Next JP Chair)

The migration file `supabase/migrations/migration_add_jp_sessions.sql` contains all three `CREATE TABLE` statements and RLS policies. The next JP chair runs it once in the Supabase SQL Editor — no Vercel changes needed, no environment variables required. The tab appears automatically after the tables exist.

**Steps for handoff:**
1. Log into Supabase dashboard → SQL Editor
2. Paste and run `supabase/migrations/migration_add_jp_sessions.sql`
3. Done — the Sessions tab is live

---

## Files to Create/Modify

| File | Action |
|---|---|
| `supabase/migrations/migration_add_jp_sessions.sql` | Create |
| `app/api/admin/sessions/route.ts` | Create (GET list, POST create) |
| `app/api/admin/sessions/[id]/route.ts` | Create (GET detail) |
| `app/api/admin/sessions/[id]/close/route.ts` | Create (POST close) |
| `app/api/admin/sessions/[id]/update-fine/route.ts` | Create (POST update status) |
| `app/admin/page.tsx` | Add Sessions tab, session list view, session detail view |
| `app/api/cron/route.ts` | Add jp_session* cleanup to Jan 4 logic |
| `lib/types.ts` | Add JpSession, JpSessionFine, JpSessionChange types |
