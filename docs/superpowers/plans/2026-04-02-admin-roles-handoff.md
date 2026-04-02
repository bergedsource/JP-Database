# Admin Roles & Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner/admin roles and a Settings tab so the JP Chair can manage users and transfer ownership entirely from within the admin portal without touching any external dashboard.

**Architecture:** A new `admin_roles` table stores each auth user's role. All mutations go through server-side API routes that use the Supabase service role key. The admin portal fetches the current user's role on load and shows/hides write controls accordingly. A new Settings tab (owner-only) handles user creation, removal, ownership transfer, and Venmo handle updates.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + Auth), Vercel env vars

---

## File Map

**Create:**
- `supabase/migrations/migration_add_roles_and_settings.sql` — DB tables + RLS + seed data
- `lib/supabase/service.ts` — Supabase service role client (server-side only)
- `lib/admin-auth.ts` — helper: get current user's role from admin_roles
- `app/api/admin/me/route.ts` — GET current user's role
- `app/api/admin/users/route.ts` — GET list users, POST create user
- `app/api/admin/users/[id]/route.ts` — DELETE remove user
- `app/api/admin/transfer/route.ts` — POST transfer ownership
- `app/api/admin/settings/route.ts` — GET read settings, PUT update setting
- `app/api/settings/route.ts` — GET public venmo settings (no auth)

**Modify:**
- `app/admin/page.tsx` — fetch role on load, read-only mode for admin users, new Settings tab
- `app/page.tsx` — fetch venmo handle/url from `/api/settings` instead of hardcoded

---

## Task 1: Add SUPABASE_SERVICE_ROLE_KEY to environment

**Files:** None (manual setup step)

- [ ] **Step 1: Get the service role key**

  Go to supabase.com → your project → Project Settings → API → copy the `service_role` key (it starts with `eyJ...`). This key bypasses RLS — never expose it to the browser.

- [ ] **Step 2: Add to Vercel**

  Go to vercel.com → JP-Database project → Settings → Environment Variables → add:
  - Name: `SUPABASE_SERVICE_ROLE_KEY`
  - Value: the key you just copied
  - Environments: Production, Preview, Development

- [ ] **Step 3: Add to local .env.local**

  Open `C:\Users\Dillon\berged-source\.env.local` and add:
  ```
  SUPABASE_SERVICE_ROLE_KEY=eyJ...your_key_here
  ```

---

## Task 2: Database migration

**Files:**
- Create: `supabase/migrations/migration_add_roles_and_settings.sql`

- [ ] **Step 1: Write the migration file**

  Create `supabase/migrations/migration_add_roles_and_settings.sql`:

  ```sql
  -- admin_roles: stores each auth user's role
  CREATE TABLE IF NOT EXISTS public.admin_roles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin')),
    email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

  -- Authenticated users can read roles (needed by admin page)
  CREATE POLICY "Authenticated users can read admin_roles"
    ON public.admin_roles FOR SELECT
    USING (auth.role() = 'authenticated');

  -- No INSERT/UPDATE/DELETE via RLS — all writes go through service role API routes

  -- settings: key-value store for configurable site values
  CREATE TABLE IF NOT EXISTS public.settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz DEFAULT now()
  );

  ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

  -- Authenticated users can read settings
  CREATE POLICY "Authenticated users can read settings"
    ON public.settings FOR SELECT
    USING (auth.role() = 'authenticated');

  -- No public read — settings are fetched server-side only

  -- Seed default settings
  INSERT INTO public.settings (key, value) VALUES
    ('venmo_handle', '@Dillon-Berge'),
    ('venmo_url', 'https://venmo.com/Dillon-Berge')
  ON CONFLICT (key) DO NOTHING;
  ```

- [ ] **Step 2: Run the migration in Supabase**

  Go to supabase.com → your project → SQL Editor → paste the entire file contents → Run.

  Expected: no errors, two new tables visible in Table Editor.

- [ ] **Step 3: Seed yourself as owner**

  In the same SQL Editor, run:

  ```sql
  INSERT INTO public.admin_roles (user_id, role, email)
  SELECT id, 'owner', email
  FROM auth.users
  WHERE email = 'bergedillon@gmail.com';
  ```

  Expected: 1 row inserted into `admin_roles`.

- [ ] **Step 4: Commit the migration file**

  ```bash
  cd /c/Users/Dillon/berged-source
  git add supabase/migrations/migration_add_roles_and_settings.sql
  git commit -m "Add admin_roles and settings migration"
  git push
  ```

---

## Task 3: Service role client

**Files:**
- Create: `lib/supabase/service.ts`

- [ ] **Step 1: Create the service client**

  Create `lib/supabase/service.ts`:

  ```typescript
  import { createClient } from "@supabase/supabase-js";

  export function createServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add lib/supabase/service.ts
  git commit -m "Add Supabase service role client"
  git push
  ```

---

## Task 4: Admin auth helper

**Files:**
- Create: `lib/admin-auth.ts`

- [ ] **Step 1: Create the helper**

  Create `lib/admin-auth.ts`:

  ```typescript
  import { createClient } from "@/lib/supabase/server";
  import { createServiceClient } from "@/lib/supabase/service";

  export type AdminRole = "owner" | "admin" | null;

  /**
   * Get the current logged-in user's role from admin_roles.
   * Returns null if not authenticated or not in admin_roles.
   */
  export async function getCurrentRole(): Promise<{ userId: string; role: AdminRole; email: string } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("admin_roles")
      .select("role, email")
      .eq("user_id", user.id)
      .single();

    if (!data) return null;
    return { userId: user.id, role: data.role as AdminRole, email: data.email };
  }

  /**
   * Require owner role. Returns 403 response if not owner.
   * Usage: const check = await requireOwner(); if (check) return check;
   */
  export async function requireOwner(): Promise<Response | null> {
    const current = await getCurrentRole();
    if (!current || current.role !== "owner") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return null;
  }

  /**
   * Require any authenticated admin role (owner or admin).
   */
  export async function requireAuth(): Promise<Response | null> {
    const current = await getCurrentRole();
    if (!current) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    return null;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add lib/admin-auth.ts
  git commit -m "Add admin role auth helper"
  git push
  ```

---

## Task 5: /api/admin/me route

**Files:**
- Create: `app/api/admin/me/route.ts`

- [ ] **Step 1: Create the route**

  Create `app/api/admin/me/route.ts`:

  ```typescript
  import { getCurrentRole } from "@/lib/admin-auth";
  import { NextResponse } from "next/server";

  export async function GET() {
    const current = await getCurrentRole();
    if (!current) {
      return NextResponse.json({ role: null }, { status: 401 });
    }
    return NextResponse.json({ role: current.role, email: current.email, userId: current.userId });
  }
  ```

- [ ] **Step 2: Verify manually**

  After deploying (or running `npm run dev` locally), log into the admin portal and open browser DevTools → Console, then run:

  ```javascript
  fetch('/api/admin/me').then(r => r.json()).then(console.log)
  ```

  Expected: `{ role: "owner", email: "bergedillon@gmail.com", userId: "..." }`

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/admin/me/route.ts
  git commit -m "Add /api/admin/me route"
  git push
  ```

---

## Task 6: /api/admin/users routes (list + create)

**Files:**
- Create: `app/api/admin/users/route.ts`

- [ ] **Step 1: Create the route**

  Create `app/api/admin/users/route.ts`:

  ```typescript
  import { requireOwner } from "@/lib/admin-auth";
  import { createServiceClient } from "@/lib/supabase/service";
  import { NextRequest, NextResponse } from "next/server";

  // GET /api/admin/users — list all admin users with roles
  export async function GET() {
    const denied = await requireOwner();
    if (denied) return denied;

    const service = createServiceClient();
    const { data, error } = await service
      .from("admin_roles")
      .select("user_id, role, email, created_at")
      .order("created_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  // POST /api/admin/users — create a new admin user with email + password + role
  export async function POST(req: NextRequest) {
    const denied = await requireOwner();
    if (denied) return denied;

    const { email, password, role } = await req.json();
    if (!email || !password || !["owner", "admin"].includes(role)) {
      return NextResponse.json({ error: "email, password, and role (owner|admin) are required" }, { status: 400 });
    }

    const service = createServiceClient();

    // Create the Supabase auth user
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });

    // Insert into admin_roles
    const { error: roleError } = await service
      .from("admin_roles")
      .insert({ user_id: created.user.id, role, email });

    if (roleError) {
      // Rollback: delete the auth user if role insert fails
      await service.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId: created.user.id });
  }
  ```

- [ ] **Step 2: Verify GET manually**

  In browser DevTools Console (while logged in as owner):

  ```javascript
  fetch('/api/admin/users').then(r => r.json()).then(console.log)
  ```

  Expected: array with your owner record.

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/admin/users/route.ts
  git commit -m "Add /api/admin/users GET and POST routes"
  git push
  ```

---

## Task 7: /api/admin/users/[id] DELETE route

**Files:**
- Create: `app/api/admin/users/[id]/route.ts`

- [ ] **Step 1: Create the route**

  Create `app/api/admin/users/[id]/route.ts`:

  ```typescript
  import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
  import { createServiceClient } from "@/lib/supabase/service";
  import { NextRequest, NextResponse } from "next/server";

  export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const denied = await requireOwner();
    if (denied) return denied;

    const { id } = await params;
    const current = await getCurrentRole();

    // Cannot delete yourself
    if (current?.userId === id) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }

    const service = createServiceClient();

    // Check target is not the only owner
    const { data: targetRole } = await service
      .from("admin_roles")
      .select("role")
      .eq("user_id", id)
      .single();

    if (targetRole?.role === "owner") {
      const { count } = await service
        .from("admin_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "owner");
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "Cannot remove the only owner" }, { status: 400 });
      }
    }

    // Delete from admin_roles (cascade will not delete auth user — we delete both)
    await service.from("admin_roles").delete().eq("user_id", id);
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add "app/api/admin/users/[id]/route.ts"
  git commit -m "Add /api/admin/users/[id] DELETE route"
  git push
  ```

---

## Task 8: /api/admin/transfer route

**Files:**
- Create: `app/api/admin/transfer/route.ts`

- [ ] **Step 1: Create the route**

  Create `app/api/admin/transfer/route.ts`:

  ```typescript
  import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
  import { createServiceClient } from "@/lib/supabase/service";
  import { NextRequest, NextResponse } from "next/server";

  // POST /api/admin/transfer — atomically promote targetUserId to owner, demote self to admin
  export async function POST(req: NextRequest) {
    const denied = await requireOwner();
    if (denied) return denied;

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
    }

    const current = await getCurrentRole();
    if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (current.userId === targetUserId) {
      return NextResponse.json({ error: "You are already the owner" }, { status: 400 });
    }

    const service = createServiceClient();

    // Promote target to owner
    const { error: promoteError } = await service
      .from("admin_roles")
      .update({ role: "owner" })
      .eq("user_id", targetUserId);

    if (promoteError) return NextResponse.json({ error: promoteError.message }, { status: 500 });

    // Demote current user to admin
    const { error: demoteError } = await service
      .from("admin_roles")
      .update({ role: "admin" })
      .eq("user_id", current.userId);

    if (demoteError) {
      // Rollback: demote target back to admin
      await service.from("admin_roles").update({ role: "admin" }).eq("user_id", targetUserId);
      return NextResponse.json({ error: demoteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/api/admin/transfer/route.ts
  git commit -m "Add /api/admin/transfer ownership route"
  git push
  ```

---

## Task 9: /api/admin/settings and /api/settings routes

**Files:**
- Create: `app/api/admin/settings/route.ts`
- Create: `app/api/settings/route.ts`

- [ ] **Step 1: Create admin settings route**

  Create `app/api/admin/settings/route.ts`:

  ```typescript
  import { requireAuth, requireOwner } from "@/lib/admin-auth";
  import { createServiceClient } from "@/lib/supabase/service";
  import { NextRequest, NextResponse } from "next/server";

  // GET /api/admin/settings — read all settings (any authenticated user)
  export async function GET() {
    const denied = await requireAuth();
    if (denied) return denied;

    const service = createServiceClient();
    const { data, error } = await service.from("settings").select("key, value");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.key] = row.value ?? "";
    return NextResponse.json(map);
  }

  // PUT /api/admin/settings — update a single setting (owner only)
  export async function PUT(req: NextRequest) {
    const denied = await requireOwner();
    if (denied) return denied;

    const { key, value } = await req.json();
    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }

    const ALLOWED_KEYS = ["venmo_handle", "venmo_url"];
    if (!ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
    }

    const service = createServiceClient();
    const { error } = await service
      .from("settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }
  ```

- [ ] **Step 2: Create public settings route**

  Create `app/api/settings/route.ts`:

  ```typescript
  import { createServiceClient } from "@/lib/supabase/service";
  import { NextResponse } from "next/server";

  const DEFAULTS = {
    venmo_handle: "@Dillon-Berge",
    venmo_url: "https://venmo.com/Dillon-Berge",
  };

  // GET /api/settings — public venmo info for the public-facing page
  export async function GET() {
    try {
      const service = createServiceClient();
      const { data } = await service
        .from("settings")
        .select("key, value")
        .in("key", ["venmo_handle", "venmo_url"]);

      const map: Record<string, string> = { ...DEFAULTS };
      for (const row of data ?? []) map[row.key] = row.value ?? map[row.key];
      return NextResponse.json(map);
    } catch {
      return NextResponse.json(DEFAULTS);
    }
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/api/admin/settings/route.ts app/api/settings/route.ts
  git commit -m "Add admin settings and public settings API routes"
  git push
  ```

---

## Task 10: Update public page to use dynamic Venmo

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add venmo state and fetch on load**

  In `app/page.tsx`, add state for venmo settings and fetch on mount. Find the existing state declarations near the top of the `Home` component and add:

  ```typescript
  const [venmo, setVenmo] = useState({ handle: "@Dillon-Berge", url: "https://venmo.com/Dillon-Berge" });
  ```

  Then in the existing `useEffect` that handles click-outside, add a venmo fetch. Replace:

  ```typescript
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  ```

  With:

  ```typescript
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setVenmo({ handle: d.venmo_handle ?? "@Dillon-Berge", url: d.venmo_url ?? "https://venmo.com/Dillon-Berge" }))
      .catch(() => {});
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  ```

- [ ] **Step 2: Use venmo state in the button**

  Find the Venmo payment button in the JSX. Replace:

  ```tsx
  <a href="https://venmo.com/Dillon-Berge" target="_blank" rel="noopener noreferrer" className="pay-btn pay-btn-venmo">
    <div className="pay-btn-icon pay-btn-icon-venmo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/venmo-logo.png" alt="Venmo" width={48} height={48} style={{ borderRadius: 12, display: "block" }} />
    </div>
    <span className="pay-btn-name">Venmo</span>
    <span className="pay-btn-handle">@Dillon-Berge</span>
  </a>
  ```

  With:

  ```tsx
  <a href={venmo.url} target="_blank" rel="noopener noreferrer" className="pay-btn pay-btn-venmo">
    <div className="pay-btn-icon pay-btn-icon-venmo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/venmo-logo.png" alt="Venmo" width={48} height={48} style={{ borderRadius: 12, display: "block" }} />
    </div>
    <span className="pay-btn-name">Venmo</span>
    <span className="pay-btn-handle">{venmo.handle}</span>
  </a>
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/page.tsx
  git commit -m "Fetch Venmo handle dynamically from settings API"
  git push
  ```

---

## Task 11: Admin page — fetch role and read-only mode

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Add userRole state**

  Find the state declarations at the top of `AdminPage` component. Add after `const [adminEmail, setAdminEmail] = useState("")`:

  ```typescript
  const [userRole, setUserRole] = useState<"owner" | "admin" | null>(null);
  ```

- [ ] **Step 2: Fetch role on mount**

  Find the existing `useEffect` that calls `loadData()`. It currently looks like:

  ```typescript
  useEffect(() => {
    (async () => {
      await loadData();
      await autoEscalateOverdueFines();
      await autoDetectSocialProbation();
    })();
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email ?? "unknown");
    });
  }, []);
  ```

  Replace with:

  ```typescript
  useEffect(() => {
    (async () => {
      await loadData();
      await autoEscalateOverdueFines();
      await autoDetectSocialProbation();
    })();
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email ?? "unknown");
    });
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setUserRole(d.role ?? null))
      .catch(() => {});
  }, []);
  ```

- [ ] **Step 3: Add View Only banner CSS**

  In the `<style>` block inside the component, add before the closing backtick:

  ```css
  .adm-view-only-banner {
    background: rgba(207,181,59,0.08);
    border: 1px solid rgba(207,181,59,0.25);
    border-radius: 8px;
    padding: 10px 18px;
    margin-bottom: 20px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--gold);
    font-family: 'IBM Plex Mono', monospace;
    text-align: center;
  }
  ```

- [ ] **Step 4: Add View Only banner to JSX**

  Find the `.adm-body` div which contains the tabs. Add the banner right after the opening `<div className="adm-body">`:

  ```tsx
  {userRole === "admin" && (
    <div className="adm-view-only-banner">View Only — Contact JP Chair to make changes</div>
  )}
  ```

- [ ] **Step 5: Gate write actions on userRole**

  Find the submit button in the Issue Fine form:

  ```tsx
  <button type="submit" disabled={fineSubmitting} className="adm-btn">
    {fineSubmitting ? "Issuing…" : "Issue Fine"}
  </button>
  ```

  Replace with:

  ```tsx
  {userRole === "owner" && (
    <button type="submit" disabled={fineSubmitting} className="adm-btn">
      {fineSubmitting ? "Issuing…" : "Issue Fine"}
    </button>
  )}
  ```

  Do the same pattern for:
  - Outstanding fine submit button (text: "Issue Outstanding Fine" or similar)
  - Add Member submit button (text: "Add Member")
  - Add Social Probation submit button
  - All delete buttons (fine delete, member delete, soc pro lift)

  For status dropdowns on fines (in the fines list), find the fine status `<select>` and wrap it:

  ```tsx
  {userRole === "owner" ? (
    <select value={fine.status} onChange={(e) => updateFineStatus(fine.id, e.target.value as FineStatus, fine)} className="adm-status-select">
      <option value="pending">Pending</option>
      <option value="upheld">Upheld</option>
      <option value="dismissed">Dismissed</option>
      <option value="paid">Paid</option>
      <option value="labor">Labor</option>
    </select>
  ) : (
    <span className="adm-status-badge" style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{fine.status}</span>
  )}
  ```

  For member status dropdowns, same pattern — show plain text for admin role.

- [ ] **Step 6: Commit**

  ```bash
  git add app/admin/page.tsx
  git commit -m "Add role-aware read-only mode to admin page"
  git push
  ```

---

## Task 12: Admin page — Settings tab

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Add Settings tab to the tab list**

  Find the Tab type definition:

  ```typescript
  type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit";
  ```

  Replace with:

  ```typescript
  type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit" | "settings";
  ```

- [ ] **Step 2: Add settings state**

  After the `const [userRole, setUserRole]` line, add:

  ```typescript
  const [adminUsers, setAdminUsers] = useState<{ user_id: string; email: string; role: string; created_at: string }[]>([]);
  const [newUserForm, setNewUserForm] = useState({ email: "", password: "", role: "admin" });
  const [newUserSubmitting, setNewUserSubmitting] = useState(false);
  const [newUserError, setNewUserError] = useState("");
  const [venmoForm, setVenmoForm] = useState({ venmo_handle: "", venmo_url: "" });
  const [venmoSaving, setVenmoSaving] = useState(false);
  const [venmoSaved, setVenmoSaved] = useState(false);
  ```

- [ ] **Step 3: Add loadAdminUsers and loadVenmoSettings functions**

  After the `loadData` function, add:

  ```typescript
  async function loadAdminUsers() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setAdminUsers(await res.json());
  }

  async function loadVenmoSettings() {
    const res = await fetch("/api/admin/settings");
    if (res.ok) {
      const data = await res.json();
      setVenmoForm({ venmo_handle: data.venmo_handle ?? "", venmo_url: data.venmo_url ?? "" });
    }
  }
  ```

- [ ] **Step 4: Load settings data when Settings tab is opened**

  Find the tab click handler in the JSX (where `setTab` is called). The tabs render as:

  ```tsx
  <button className={`adm-tab${tab === "fines" ? " active" : ""}`} onClick={() => setTab("fines")}>Fines</button>
  ```

  Add the Settings tab button — only shown to owners:

  ```tsx
  {userRole === "owner" && (
    <button
      className={`adm-tab${tab === "settings" ? " active" : ""}`}
      onClick={() => { setTab("settings"); loadAdminUsers(); loadVenmoSettings(); }}
    >
      Settings
    </button>
  )}
  ```

- [ ] **Step 5: Add createUser function**

  After `loadVenmoSettings`, add:

  ```typescript
  async function createAdminUser(e: React.FormEvent) {
    e.preventDefault();
    setNewUserSubmitting(true);
    setNewUserError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUserForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setNewUserError(data.error ?? "Failed to create user");
    } else {
      setNewUserForm({ email: "", password: "", role: "admin" });
      await loadAdminUsers();
    }
    setNewUserSubmitting(false);
  }

  async function removeAdminUser(userId: string) {
    if (!confirm("Remove this user? They will lose access immediately.")) return;
    await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    await loadAdminUsers();
  }

  async function transferOwnership(targetUserId: string, targetEmail: string) {
    if (!confirm(`Transfer ownership to ${targetEmail}? You will become an admin.`)) return;
    const res = await fetch("/api/admin/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });
    if (res.ok) {
      setUserRole("admin");
      await loadAdminUsers();
    }
  }

  async function saveVenmo(e: React.FormEvent) {
    e.preventDefault();
    setVenmoSaving(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "venmo_handle", value: venmoForm.venmo_handle }),
    });
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "venmo_url", value: venmoForm.venmo_url }),
    });
    setVenmoSaving(false);
    setVenmoSaved(true);
    setTimeout(() => setVenmoSaved(false), 2500);
  }
  ```

- [ ] **Step 6: Add Settings tab JSX panel**

  Find where the other tab panels are rendered (e.g. `{tab === "audit" && (...)}`) and add after the audit panel:

  ```tsx
  {tab === "settings" && userRole === "owner" && (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* User Management */}
      <div className="adm-card">
        <div className="adm-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="adm-card-title">Admin Users</span>
        </div>
        <div className="adm-card-body">
          <table className="adm-table" style={{ marginBottom: 24 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((u) => (
                <tr key={u.user_id}>
                  <td style={{ fontWeight: 500 }}>{u.email}</td>
                  <td>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const,
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: u.role === "owner" ? "var(--gold)" : "var(--text-muted)",
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {u.role === "admin" && (
                      <button
                        onClick={() => transferOwnership(u.user_id, u.email)}
                        style={{ background: "rgba(207,181,59,0.1)", border: "1px solid rgba(207,181,59,0.3)", color: "var(--gold)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}
                      >
                        Transfer Ownership
                      </button>
                    )}
                    <button onClick={() => removeAdminUser(u.user_id)} className="adm-delete-btn">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="adm-label" style={{ marginBottom: 12 }}>Add New User</p>
          <form onSubmit={createAdminUser} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label className="adm-label">Email</label>
              <input
                type="email"
                required
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="email@example.com"
                className="adm-input"
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label className="adm-label">Password</label>
              <input
                type="password"
                required
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                placeholder="Set a password"
                className="adm-input"
              />
            </div>
            <div>
              <label className="adm-label">Role</label>
              <select
                value={newUserForm.role}
                onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                className="adm-input"
                style={{ width: "auto" }}
              >
                <option value="admin">Admin (view only)</option>
                <option value="owner">Owner (full access)</option>
              </select>
            </div>
            {newUserError && <p className="adm-error">{newUserError}</p>}
            <button type="submit" disabled={newUserSubmitting} className="adm-btn">
              {newUserSubmitting ? "Creating…" : "Create User"}
            </button>
          </form>
        </div>
      </div>

      {/* Payment Info */}
      <div className="adm-card">
        <div className="adm-card-header">
          <span className="adm-card-title">Payment Info</span>
        </div>
        <div className="adm-card-body">
          <form onSubmit={saveVenmo} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
            <div>
              <label className="adm-label">Venmo Handle</label>
              <input
                type="text"
                value={venmoForm.venmo_handle}
                onChange={(e) => setVenmoForm({ ...venmoForm, venmo_handle: e.target.value })}
                placeholder="@handle"
                className="adm-input"
              />
            </div>
            <div>
              <label className="adm-label">Venmo URL</label>
              <input
                type="text"
                value={venmoForm.venmo_url}
                onChange={(e) => setVenmoForm({ ...venmoForm, venmo_url: e.target.value })}
                placeholder="https://venmo.com/username"
                className="adm-input"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button type="submit" disabled={venmoSaving} className="adm-btn">
                {venmoSaving ? "Saving…" : "Save Venmo"}
              </button>
              {venmoSaved && <span style={{ fontSize: 12, color: "var(--gold)", fontFamily: "'IBM Plex Mono', monospace" }}>Saved ✓</span>}
            </div>
          </form>
          <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
              Cash App handle ($AcaciaOSU) is hardcoded — contact the developer to update it.
            </p>
          </div>
        </div>
      </div>

    </div>
  )}
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add app/admin/page.tsx
  git commit -m "Add Settings tab with user management and Venmo editor"
  git push
  ```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Deploy and verify owner view**

  After Vercel deploys, log in as yourself. Confirm:
  - Settings tab appears
  - Your email shows with role "owner" in the users table
  - Venmo form is pre-filled with current values

- [ ] **Step 2: Create a test admin user**

  In Settings → Add New User, enter a test email + password + role "Admin (view only)" → Create User.

  Expected: user appears in the table immediately.

- [ ] **Step 3: Log in as the test admin user**

  Open a private/incognito window → go to `/admin/login` → log in with the test credentials.

  Expected:
  - "View Only" banner appears at the top
  - No submit buttons visible on Fines, Outstanding, Members tabs
  - Settings tab not visible

- [ ] **Step 4: Verify API protection**

  While logged in as admin user, in DevTools Console run:

  ```javascript
  fetch('/api/admin/users', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email:'x@x.com',password:'test123',role:'owner'}) }).then(r => r.json()).then(console.log)
  ```

  Expected: `{ error: "Forbidden" }` with status 403.

- [ ] **Step 5: Remove test user**

  Log back in as owner → Settings → Remove the test user.

  Expected: user disappears from table.

- [ ] **Step 6: Verify Venmo update flows to public page**

  In Settings → Payment Info, change the Venmo handle to something temporary (e.g. `@TestHandle`) → Save.

  Go to the public page, look up a member with an outstanding balance — confirm the Venmo button shows `@TestHandle`.

  Change it back to `@Dillon-Berge` → Save.
