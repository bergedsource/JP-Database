# Admin Refactor Design Spec

**Date:** 2026-04-11
**Goal:** Split the 2,853-line admin page into maintainable components, move all client-side database writes behind API routes, and consolidate fine type definitions into a single source of truth.

**Constraint:** No visual or behavioral changes. The site looks and works exactly the same after.

---

## 1. Component Split (Option A — Props)

### New file structure

```
app/admin/
  page.tsx                          — Shell (~150 lines): auth, data loading, tab state, tab switching
  admin.css                         — All admin CSS extracted from the inline <style> tag
  components/
    FinesTab.tsx                    — Issue fine form, custom bylaw CRUD, filters, fine list (recent/older split)
    OutstandingTab.tsx              — Outstanding fine form, grouped-by-member view with totals
    MembersTab.tsx                  — Add member form, member table with status/delete
    SocialProbationTab.tsx          — Add SP form, active SP table with lift button
    AuditTab.tsx                    — Annual reset countdown, audit log table
    SessionsTab.tsx                 — Session list, session detail, create/close session, fine status changes
    TransitionTab.tsx               — Admin user CRUD, payment info, term export, budget sheet config
    EventsTab.tsx                   — Creator/root event log table
```

### Parent page responsibilities

`page.tsx` owns:
- Auth state: `userRole`, `currentUserId`, `adminEmail`, `isPrivileged`
- Shared data: `members`, `fines`, `socialProbations`, `auditLogs`
- `loadData()` function that fetches all shared data from Supabase
- Tab state: `tab`, `setTab`
- A `refresh` callback passed to all tabs so they can trigger data reload after mutations

### Tab component interface pattern

Each tab receives only the props it needs. Example:

```ts
interface FinesTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  currentUserId: string | null;
  adminEmail: string;
  userRole: "owner" | "admin" | "root" | null;
  refresh: () => Promise<void>;
}
```

Tabs own their own local state (form inputs, loading flags, error messages). Tabs call API routes for mutations, then call `refresh()` to reload shared data.

### What stays in page.tsx

- `loadData()` — the 4-query parallel fetch (members, fines, audit_logs, social_probation)
- Auth check via `/api/admin/me`
- `signOut()`
- Tab bar rendering + conditional tab display
- The loading skeleton

### What moves to tab components

Each tab takes its entire JSX block and the functions it uses (form handlers, local state, submission logic). No logic is shared between tabs except through the props above.

---

## 2. New API Routes

All mutations move server-side. Each route follows the existing pattern:
1. `requireAuth()` or `requireOwner()` guard
2. Parse + validate request body
3. Use `createServiceClient()` for database operations
4. Write audit log entry on success
5. Return JSON result

### Routes to create

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/admin/fines` | POST | owner | Create fines (one or many members, status: pending) |
| `/api/admin/fines/[id]` | DELETE | owner | Delete a fine |
| `/api/admin/fines/[id]/status` | PUT | owner | Change fine status + handle paid-export side effect |
| `/api/admin/fines/[id]/amount` | PUT | owner/creator | Edit fine amount |
| `/api/admin/fines/outstanding` | POST | owner | Create upheld fine + optional social probation |
| `/api/admin/members` | POST | owner | Add a member |
| `/api/admin/members/[id]/status` | PUT | owner | Change member status |
| `/api/admin/members/[id]` | DELETE | owner | Delete member + cascade fines |
| `/api/admin/social-probation` | POST | owner | Add social probation entry |
| `/api/admin/social-probation/[id]` | DELETE | owner | Lift social probation (set end_date to today) |

### Audit logging

Every route writes to `audit_logs` (or `system_events` for root users). The admin email comes from the authenticated session, not from the client — eliminating the current pattern where the client sends its own email for logging.

### Auth for amount editing

`PUT /api/admin/fines/[id]/amount` checks: user is owner/root OR user's `currentUserId` matches the fine's `created_by_user_id`. This preserves the current behavior where fine creators can edit their own fine amounts.

---

## 3. Fine Types Consolidation

### New file: `lib/fine-types.ts`

Contains three exports:
- `FINE_TYPES`: the ordered array of all built-in fine type strings
- `FINE_DEFAULT_AMOUNTS`: `Record<string, number>` mapping fine type → default dollar amount
- `FINE_DESCRIPTIONS`: `Record<string, string>` mapping fine type → description text

### Type derivation

```ts
export const FINE_TYPES = [ ... ] as const;
export type FineType = (typeof FINE_TYPES)[number] | string; // string allows custom bylaws
```

This replaces the manually-maintained union type in `lib/types.ts`. The type is derived from the array so they can never diverge.

### Consumers

- `lib/types.ts` — re-exports `FineType` from `lib/fine-types.ts` (no breaking change for existing imports)
- `app/admin/components/FinesTab.tsx` — imports `FINE_TYPES`, `FINE_DEFAULT_AMOUNTS`, `FINE_DESCRIPTIONS`
- `app/admin/components/OutstandingTab.tsx` — imports `FINE_TYPES`, `FINE_DESCRIPTIONS`

---

## 4. CSS Extraction

### Admin CSS

Move the entire contents of the `<style>` tag in `admin/page.tsx` (~400 lines) into `app/admin/admin.css`. Import it at the top of `page.tsx`:

```ts
import "./admin.css";
```

No class names change. No visual changes.

### Public page CSS

Out of scope for this refactor. The public page inline CSS stays as-is.

---

## 5. What Does NOT Change

- Database schema — no migrations
- Public-facing page (`app/page.tsx`) — untouched
- Existing API routes (sessions, users, settings, cron, search, etc.) — untouched
- Authentication flow (login, logout, password reset) — untouched
- Supabase client/server/service setup — untouched
- How the site looks or behaves — identical before and after

---

## 6. Migration Strategy

The refactor happens in this order to keep the app working at every step:

1. **Extract CSS** — move styles to `admin.css`, verify no visual changes
2. **Create `lib/fine-types.ts`** — consolidate fine type data, update imports
3. **Create API routes** — add the 10 new routes, each independently testable
4. **Split components** — extract tabs one at a time, switching each tab to use API routes as it's extracted
5. **Clean up** — remove unused direct Supabase calls from the admin page, verify nothing references the old patterns

Each step is independently deployable and testable.
