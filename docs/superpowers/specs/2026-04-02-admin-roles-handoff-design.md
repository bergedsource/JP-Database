# Admin Roles & Handoff Design

**Date:** 2026-04-02
**Project:** Acacia OSU JP Database
**Status:** Approved

---

## Problem

The JP Chair position rotates yearly. Currently the entire site requires touching Supabase, Vercel, and GitHub dashboards to hand off. The next JP chair needs to be able to run and transfer the site entirely from within the admin portal — no code, no external dashboards.

Additionally, other officers (e.g. Venerable Dean) need read-only visibility into the backend without the ability to modify anything.

---

## Roles

Two roles, enforced server-side:

| Role | Can Do |
|---|---|
| **owner** | Everything: issue/update/delete fines, manage members, soc pro, invite/remove users, transfer ownership, update Venmo handle |
| **admin** | Read-only: view fines, members, soc pro, audit log. No write actions. |

- There must always be exactly one owner at any time.
- Transfer Ownership is atomic — new owner is promoted and current owner is demoted in the same operation.
- Only owners can access the Settings tab.

---

## Architecture

### Role Storage

A new `admin_roles` table in Supabase stores each auth user's role:

```sql
CREATE TABLE public.admin_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin')),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

RLS: only authenticated users can read. Only service-role can write (all mutations go through server-side API routes).

### Settings Storage

A new `settings` table stores configurable values:

```sql
CREATE TABLE public.settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);
```

Initial rows:
- `venmo_handle` → `@Dillon-Berge`
- `venmo_url` → `https://venmo.com/Dillon-Berge`

RLS: authenticated users can read and write. Public cannot read (payment info fetched server-side via existing `/api/settings` route pattern).

### Role Enforcement

**Server-side API routes** handle all mutations. Each route:
1. Reads the caller's session from cookies
2. Looks up their role in `admin_roles`
3. Rejects with 403 if role is insufficient

**Client-side** hides write controls (buttons, forms) for admin-role users — purely UX, not a security boundary. Security lives in the API routes.

**Proxy (proxy.ts):** No changes needed. Auth check (logged in or not) stays the same. Role check happens inside the admin page and API routes.

---

## New API Routes

All under `/app/api/admin/`:

| Route | Method | Auth Required | Purpose |
|---|---|---|---|
| `/api/admin/users` | GET | owner | List all admin users with roles |
| `/api/admin/users` | POST | owner | Create new user with email + password + role |
| `/api/admin/users/[id]` | DELETE | owner | Remove a user |
| `/api/admin/transfer` | POST | owner | Transfer ownership to another user |
| `/api/admin/settings` | GET | authenticated | Read settings |
| `/api/admin/settings` | PUT | owner | Update a setting value |
| `/api/admin/me` | GET | authenticated | Get current user's role |

All routes use `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never exposed to browser).

---

## Admin Portal Changes

### New "Settings" Tab (owner only)

Visible only to owners. Contains two sections:

**User Management:**
- Table listing all admin users: Email, Role badge, actions
- "Add User" form: email input + password input + role dropdown (owner/admin) + Create button — account is created immediately, no email required, new user logs in with those credentials
- Remove button per user (cannot remove yourself if you are the only owner)
- "Transfer Ownership" button per owner-role row — promotes that user to owner, demotes current user to admin atomically

**Payment Info:**
- Venmo handle input (editable, saves to `settings` table)
- Venmo URL input (editable)
- Cash App fields shown as read-only (labeled "contact developer to update")
- Save button, confirmation on success

### Role-Aware Admin Page

On load, the admin page fetches `/api/admin/me` to get the current user's role. This is stored in React state.

**For admin-role users:**
- All form submit buttons are hidden or disabled
- Status dropdowns on fines are read-only (rendered as plain text)
- Member status dropdowns are read-only
- "Delete" buttons hidden
- Settings tab hidden entirely
- A subtle "View Only" banner shown at the top

**For owner-role users:**
- No changes to existing behavior

---

## Settings Migration

New SQL migration: `supabase/migrations/migration_add_roles_and_settings.sql`

Contents:
1. Create `admin_roles` table
2. Create `settings` table  
3. Insert default settings rows (venmo_handle, venmo_url)
4. RLS policies for both tables

**Important:** After running the migration, the current owner (Dillon) must be manually inserted into `admin_roles` via the Supabase SQL editor once:
```sql
INSERT INTO public.admin_roles (user_id, role, email)
SELECT id, 'owner', email FROM auth.users WHERE email = 'bergedillon@gmail.com';
```

After that, all future user management happens from within the portal.

---

## Venmo on Public Page

Currently hardcoded in `app/page.tsx`. After this change:
- Public page fetches `/api/settings` (new server-side route) on load
- Returns only `venmo_handle` and `venmo_url` (whitelist — no other settings exposed)
- Falls back to current hardcoded values if fetch fails

---

## Environment Variables

One new Vercel env var required:
- `SUPABASE_SERVICE_ROLE_KEY` — found in Supabase dashboard → Project Settings → API → service_role key

This is never exposed to the browser. All service-role operations are server-side only.

---

## Handoff Flow (end state)

1. Outgoing JP chair logs into admin portal
2. Goes to Settings → Users → "Add User" → enters new chair's email + password + role → creates account instantly
3. New chair logs in with those credentials
4. Outgoing chair goes to Settings → Users → clicks "Transfer Ownership" next to new chair
5. New chair is now owner, outgoing chair becomes admin or is removed
6. Done — no Supabase, no Vercel, no GitHub touched

---

## Out of Scope

- Cash App handle is not editable from the portal (hardcoded, requires code change)
- No audit logging of settings changes (can be added later)
- No password reset flow within the portal (Supabase handles this via email)
- No multi-owner support (exactly one owner at all times)
