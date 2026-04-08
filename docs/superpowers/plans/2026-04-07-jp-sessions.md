# JP Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sessions tab to the admin panel that lets the JP Chair create meeting sessions, adjudicate pending fines during that session, and review a change log per session.

**Architecture:** Three new Supabase tables (`jp_sessions`, `jp_session_fines`, `jp_session_changes`) backed by five new API routes. The admin page gains a Sessions tab with a list view and an inline detail view. Fine status changes made from within a session view are written to both the `fines` table and `jp_session_changes`. All session records are wiped on January 4th in the existing cron job.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL + service role client), existing `requireAuth` / `requireOwner` / `createServiceClient` helpers, React state (no new libraries).

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/migration_add_jp_sessions.sql` | Create |
| `lib/types.ts` | Modify — add `JpSession`, `JpSessionFine`, `JpSessionChange` |
| `app/api/admin/sessions/route.ts` | Create — GET list, POST create |
| `app/api/admin/sessions/[id]/route.ts` | Create — GET detail |
| `app/api/admin/sessions/[id]/close/route.ts` | Create — POST close |
| `app/api/admin/sessions/[id]/update-fine/route.ts` | Create — POST update fine status |
| `app/admin/page.tsx` | Modify — Sessions tab button, state, list view, detail view |
| `app/api/cron/route.ts` | Modify — Jan 4 cleanup for session tables |

---

## Task 1: Migration SQL

**Files:**
- Create: `supabase/migrations/migration_add_jp_sessions.sql`

- [ ] **Create the migration file**

```sql
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
```

- [ ] **Run in Supabase SQL Editor**

Log into supabase.com → project `cmojatypstayjrrwjjfn` → SQL Editor → paste and run the file above. Verify three new tables appear in the Table Editor.

- [ ] **Commit**

```bash
git add supabase/migrations/migration_add_jp_sessions.sql
git commit -m "Add jp_sessions migration — three tables with RLS"
```

---

## Task 2: Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Append the three new types to the bottom of `lib/types.ts`**

```typescript
export interface JpSession {
  id: string;
  date_held: string;       // "YYYY-MM-DD"
  closed_at: string | null;
  created_at: string;
  fine_count?: number;     // populated by list route via count join
}

export interface JpSessionFine {
  session_id: string;
  fine_id: string;
  snapshot_status: string;
  // joined fine fields:
  fine_type: string;
  description: string;
  amount: number | null;
  status: string;          // current status (may differ from snapshot)
  term: string;
  date_issued: string;
  fining_officer: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  member_id: string;
  member_name: string;
}

export interface JpSessionChange {
  id: string;
  session_id: string;
  fine_id: string;
  changed_by_user_id: string;
  changed_by_email: string;
  old_status: string;
  new_status: string;
  changed_at: string;
  // joined fine fields for display:
  member_name?: string;
  fine_type?: string;
}
```

- [ ] **Commit**

```bash
git add lib/types.ts
git commit -m "Add JpSession, JpSessionFine, JpSessionChange types"
```

---

## Task 3: GET /api/admin/sessions — list all sessions

**Files:**
- Create: `app/api/admin/sessions/route.ts`

- [ ] **Create `app/api/admin/sessions/route.ts`**

```typescript
import { requireAuth } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// GET /api/admin/sessions — list all sessions with fine count, newest first
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();

  const { data: sessions, error } = await service
    .from("jp_sessions")
    .select("id, date_held, closed_at, created_at")
    .order("date_held", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get fine counts per session
  const { data: counts } = await service
    .from("jp_session_fines")
    .select("session_id");

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.session_id] = (countMap[row.session_id] ?? 0) + 1;
  }

  const result = (sessions ?? []).map((s) => ({
    ...s,
    fine_count: countMap[s.id] ?? 0,
  }));

  return NextResponse.json(result);
}
```

- [ ] **Commit**

```bash
git add app/api/admin/sessions/route.ts
git commit -m "Add GET /api/admin/sessions route"
```

---

## Task 4: POST /api/admin/sessions — create a session

**Files:**
- Modify: `app/api/admin/sessions/route.ts`

- [ ] **Add the POST handler to `app/api/admin/sessions/route.ts`** (append after the GET export)

```typescript
import { requireAuth, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
```

Replace the import line at the top of the file (it currently only imports `requireAuth`):

```typescript
import { requireAuth, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
```

Then append after the GET function:

```typescript
// POST /api/admin/sessions — create a new session, snapshot all pending fines
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { date_held } = await req.json();
  if (!date_held || typeof date_held !== "string") {
    return NextResponse.json({ error: "date_held is required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Create the session
  const { data: session, error: sessionError } = await service
    .from("jp_sessions")
    .insert({ date_held })
    .select("id")
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: sessionError?.message ?? "Failed to create session" }, { status: 500 });
  }

  // Snapshot all currently pending fines
  const { data: pendingFines } = await service
    .from("fines")
    .select("id")
    .eq("status", "pending");

  if (pendingFines && pendingFines.length > 0) {
    await service.from("jp_session_fines").insert(
      pendingFines.map((f) => ({
        session_id: session.id,
        fine_id: f.id,
        snapshot_status: "pending",
      }))
    );
  }

  return NextResponse.json({ id: session.id, fine_count: pendingFines?.length ?? 0 });
}
```

- [ ] **Commit**

```bash
git add app/api/admin/sessions/route.ts
git commit -m "Add POST /api/admin/sessions — create session and snapshot pending fines"
```

---

## Task 5: GET /api/admin/sessions/[id] — session detail

**Files:**
- Create: `app/api/admin/sessions/[id]/route.ts`

- [ ] **Create `app/api/admin/sessions/[id]/route.ts`**

```typescript
import { requireAuth } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/sessions/[id] — session detail: fines + change log
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;
  const service = createServiceClient();

  // Get session
  const { data: session, error: sessionError } = await service
    .from("jp_sessions")
    .select("id, date_held, closed_at, created_at")
    .eq("id", id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get fines in this session, joined with member name and fine fields
  const { data: sessionFines, error: finesError } = await service
    .from("jp_session_fines")
    .select(`
      session_id,
      fine_id,
      snapshot_status,
      fines (
        id,
        member_id,
        fine_type,
        description,
        amount,
        status,
        term,
        date_issued,
        fining_officer,
        notes,
        created_by_user_id,
        members ( name )
      )
    `)
    .eq("session_id", id);

  if (finesError) {
    return NextResponse.json({ error: finesError.message }, { status: 500 });
  }

  // Flatten the joined data
  const fines = (sessionFines ?? []).map((row: any) => ({
    session_id: row.session_id,
    fine_id: row.fine_id,
    snapshot_status: row.snapshot_status,
    fine_type: row.fines?.fine_type ?? "",
    description: row.fines?.description ?? "",
    amount: row.fines?.amount ?? null,
    status: row.fines?.status ?? "",
    term: row.fines?.term ?? "",
    date_issued: row.fines?.date_issued ?? "",
    fining_officer: row.fines?.fining_officer ?? null,
    notes: row.fines?.notes ?? null,
    created_by_user_id: row.fines?.created_by_user_id ?? null,
    member_id: row.fines?.member_id ?? "",
    member_name: row.fines?.members?.name ?? "",
  }));

  // Get change log for this session
  const { data: changes } = await service
    .from("jp_session_changes")
    .select(`
      id,
      session_id,
      fine_id,
      changed_by_user_id,
      changed_by_email,
      old_status,
      new_status,
      changed_at,
      fines ( fine_type, members ( name ) )
    `)
    .eq("session_id", id)
    .order("changed_at", { ascending: true });

  const changeLog = (changes ?? []).map((c: any) => ({
    id: c.id,
    session_id: c.session_id,
    fine_id: c.fine_id,
    changed_by_user_id: c.changed_by_user_id,
    changed_by_email: c.changed_by_email,
    old_status: c.old_status,
    new_status: c.new_status,
    changed_at: c.changed_at,
    member_name: c.fines?.members?.name ?? "",
    fine_type: c.fines?.fine_type ?? "",
  }));

  return NextResponse.json({ session, fines, changes: changeLog });
}
```

- [ ] **Commit**

```bash
git add "app/api/admin/sessions/[id]/route.ts"
git commit -m "Add GET /api/admin/sessions/[id] — session detail with fines and change log"
```

---

## Task 6: POST /api/admin/sessions/[id]/close

**Files:**
- Create: `app/api/admin/sessions/[id]/close/route.ts`

- [ ] **Create `app/api/admin/sessions/[id]/close/route.ts`**

```typescript
import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/sessions/[id]/close — mark a session as closed
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const service = createServiceClient();

  const { error } = await service
    .from("jp_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Commit**

```bash
git add "app/api/admin/sessions/[id]/close/route.ts"
git commit -m "Add POST /api/admin/sessions/[id]/close"
```

---

## Task 7: POST /api/admin/sessions/[id]/update-fine

**Files:**
- Create: `app/api/admin/sessions/[id]/update-fine/route.ts`

- [ ] **Create `app/api/admin/sessions/[id]/update-fine/route.ts`**

```typescript
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/sessions/[id]/update-fine — update a fine's status, log the change
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id: session_id } = await params;
  const { fine_id, new_status } = await req.json();

  if (!fine_id || !new_status) {
    return NextResponse.json({ error: "fine_id and new_status are required" }, { status: 400 });
  }

  const VALID_STATUSES = ["pending", "upheld", "dismissed", "paid", "labor", "overturned"];
  if (!VALID_STATUSES.includes(new_status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Verify this fine is part of this session
  const { data: sessionFine } = await service
    .from("jp_session_fines")
    .select("fine_id")
    .eq("session_id", session_id)
    .eq("fine_id", fine_id)
    .single();

  if (!sessionFine) {
    return NextResponse.json({ error: "Fine not in this session" }, { status: 404 });
  }

  // Get current fine status
  const { data: fine } = await service
    .from("fines")
    .select("status")
    .eq("id", fine_id)
    .single();

  if (!fine) return NextResponse.json({ error: "Fine not found" }, { status: 404 });

  const old_status = fine.status;

  // Update the fine status
  const { error: updateError } = await service
    .from("fines")
    .update({ status: new_status })
    .eq("id", fine_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Log to jp_session_changes
  await service.from("jp_session_changes").insert({
    session_id,
    fine_id,
    changed_by_user_id: current.userId,
    changed_by_email: current.email,
    old_status,
    new_status,
  });

  // Log to audit_logs (consistent with existing audit trail)
  await service.from("audit_logs").insert({
    admin_email: current.email,
    action: "Fine Status Updated (JP Session)",
    details: `Fine ${fine_id} changed from ${old_status} to ${new_status} during session ${session_id}`,
  });

  return NextResponse.json({ success: true, old_status, new_status });
}
```

- [ ] **Commit**

```bash
git add "app/api/admin/sessions/[id]/update-fine/route.ts"
git commit -m "Add POST /api/admin/sessions/[id]/update-fine — updates fine status and logs change"
```

---

## Task 8: Cron cleanup — delete session records on Jan 4

**Files:**
- Modify: `app/api/cron/route.ts`

- [ ] **In `app/api/cron/route.ts`, find the January 4th block (around line 60) and add session cleanup before the fines delete**

Find this section:
```typescript
  if (month === 1 && day === 4) {
    const { count } = await service
      .from("fines")
      .select("*", { count: "exact", head: true });

    // Delete all auto soc pro entries (manual ones are preserved)
    await service.from("social_probation").delete().eq("source", "auto");
    // Delete all fines
    await service.from("fines").delete().neq("id", "00000000-0000-0000-0000-000000000000");
```

Replace with:
```typescript
  if (month === 1 && day === 4) {
    const { count } = await service
      .from("fines")
      .select("*", { count: "exact", head: true });

    // Delete JP session records (FK-safe order: changes → fines → sessions)
    await service.from("jp_session_changes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await service.from("jp_session_fines").delete().neq("session_id", "00000000-0000-0000-0000-000000000000");
    await service.from("jp_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Delete all auto soc pro entries (manual ones are preserved)
    await service.from("social_probation").delete().eq("source", "auto");
    // Delete all fines
    await service.from("fines").delete().neq("id", "00000000-0000-0000-0000-000000000000");
```

- [ ] **Commit**

```bash
git add app/api/cron/route.ts
git commit -m "Delete jp_session records in Jan 4 annual cleanup"
```

---

## Task 9: Admin page — Tab type, state, and load functions

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Update the Tab type (line 62) to include "sessions"**

Find:
```typescript
type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit" | "transition" | "events";
```

Replace with:
```typescript
type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit" | "sessions" | "transition" | "events";
```

- [ ] **Add the import for the new types at the top of `app/admin/page.tsx`**

Find:
```typescript
import { Fine, FineStatus, FineType, Member, AuditLog, SocialProbation } from "@/lib/types";
```

Replace with:
```typescript
import { Fine, FineStatus, FineType, Member, AuditLog, SocialProbation, JpSession, JpSessionFine, JpSessionChange } from "@/lib/types";
```

- [ ] **Add session state variables** — place after the `filterOfficer` state (around line 180)

```typescript
  const [sessions, setSessions] = useState<JpSession[]>([]);
  const [sessionView, setSessionView] = useState<"list" | "detail">("list");
  const [sessionDetail, setSessionDetail] = useState<{
    session: JpSession;
    fines: JpSessionFine[];
    changes: JpSessionChange[];
  } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [newSessionSubmitting, setNewSessionSubmitting] = useState(false);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
```

- [ ] **Add load and action functions** — place after the `loadVenmoSettings` function

```typescript
  async function loadSessions() {
    setSessionLoading(true);
    const res = await fetch("/api/admin/sessions");
    if (res.ok) setSessions(await res.json());
    setSessionLoading(false);
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setNewSessionSubmitting(true);
    await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date_held: newSessionDate }),
    });
    await loadSessions();
    setNewSessionSubmitting(false);
  }

  async function loadSessionDetail(id: string) {
    setSessionDetailLoading(true);
    const res = await fetch(`/api/admin/sessions/${id}`);
    if (res.ok) {
      setSessionDetail(await res.json());
      setSessionView("detail");
    }
    setSessionDetailLoading(false);
  }

  async function closeSession(id: string) {
    if (!confirm("Close this session? Owner and root can still make changes after closing.")) return;
    await fetch(`/api/admin/sessions/${id}/close`, { method: "POST" });
    await loadSessionDetail(id);
    await loadSessions();
  }

  async function updateSessionFineStatus(sessionId: string, fineId: string, newStatus: FineStatus) {
    await fetch(`/api/admin/sessions/${sessionId}/update-fine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fine_id: fineId, new_status: newStatus }),
    });
    await loadSessionDetail(sessionId);
  }
```

- [ ] **Add Sessions tab button** — in the tabs div, after the audit `isPrivileged` block and before the Transition `isPrivileged` block

Find:
```typescript
            {isPrivileged && (
              <button
                className={`adm-tab${tab === "transition" ? " active" : ""}`}
                onClick={() => { setTab("transition"); loadAdminUsers(); loadVenmoSettings(); }}
              >
                Transition
              </button>
            )}
```

Insert before it:
```typescript
            <button
              className={`adm-tab${tab === "sessions" ? " active" : ""}`}
              onClick={() => { setTab("sessions"); loadSessions(); setSessionView("list"); }}
            >
              sessions
            </button>
```

- [ ] **Commit**

```bash
git add app/admin/page.tsx
git commit -m "Add Sessions tab type, state, load functions, and tab button to admin page"
```

---

## Task 10: Admin page — Sessions list view

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Add the sessions list view JSX** — find the `{tab === "transition" && isPrivileged && (` block and insert the sessions tab block immediately before it

```typescript
              {tab === "sessions" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                  {/* New Session — owner/root only */}
                  {isPrivileged && sessionView === "list" && (
                    <div className="adm-card">
                      <div className="adm-card-header">
                        <span className="adm-card-title">New Session</span>
                      </div>
                      <div className="adm-card-body">
                        <form onSubmit={createSession} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <div>
                            <label className="adm-label">Date Held</label>
                            <input
                              type="date"
                              value={newSessionDate}
                              onChange={(e) => setNewSessionDate(e.target.value)}
                              className="adm-input"
                              required
                            />
                          </div>
                          <button type="submit" disabled={newSessionSubmitting} className="adm-btn">
                            {newSessionSubmitting ? "Starting…" : "Start Session"}
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* Sessions list */}
                  {sessionView === "list" && (
                    <div className="adm-card">
                      <div className="adm-card-header">
                        <span className="adm-card-title">All Sessions</span>
                      </div>
                      {sessionLoading ? (
                        <p className="adm-empty">Loading…</p>
                      ) : sessions.length === 0 ? (
                        <p className="adm-empty">No sessions yet.</p>
                      ) : (
                        <table className="adm-table">
                          <thead>
                            <tr>
                              <th>Date Held</th>
                              <th>Fines</th>
                              <th>Status</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {sessions.map((s) => (
                              <tr key={s.id}>
                                <td style={{ fontWeight: 500 }}>
                                  {new Date(s.date_held + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                </td>
                                <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                                  {s.fine_count} fine{s.fine_count !== 1 ? "s" : ""}
                                </td>
                                <td>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" as const,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    color: s.closed_at ? "var(--text-dim)" : "var(--gold)",
                                  }}>
                                    {s.closed_at ? "closed" : "open"}
                                  </span>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    onClick={() => loadSessionDetail(s.id)}
                                    style={{ fontSize: 12, background: "rgba(207,181,59,0.1)", border: "1px solid rgba(207,181,59,0.3)", color: "var(--gold)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )}
```

- [ ] **Commit**

```bash
git add app/admin/page.tsx
git commit -m "Add Sessions list view to admin page"
```

---

## Task 11: Admin page — Session detail view

**Files:**
- Modify: `app/admin/page.tsx`

- [ ] **Add the session detail view JSX** — inside `{tab === "sessions" && (`, after the sessions list block (before the closing `</div>`)

Find the closing `</div>` of the sessions tab block (after the sessions list card) and insert before it:

```typescript
                  {/* Session detail */}
                  {sessionView === "detail" && sessionDetail && (
                    <>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setSessionView("list")}
                          style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontFamily: "'IBM Plex Sans', sans-serif" }}
                        >
                          ← Back
                        </button>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                          {new Date(sessionDetail.session.date_held + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" as const,
                          fontFamily: "'IBM Plex Mono', monospace",
                          color: sessionDetail.session.closed_at ? "var(--text-dim)" : "var(--gold)",
                        }}>
                          {sessionDetail.session.closed_at ? "closed" : "open"}
                        </span>
                        {isPrivileged && !sessionDetail.session.closed_at && (
                          <button
                            onClick={() => closeSession(sessionDetail.session.id)}
                            style={{ marginLeft: "auto", fontSize: 12, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--red)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}
                          >
                            Close Session
                          </button>
                        )}
                      </div>

                      {sessionDetailLoading && <p className="adm-empty">Loading…</p>}

                      {/* Fines in this session */}
                      <div className="adm-card">
                        <div className="adm-card-header">
                          <span className="adm-card-title">Fines in This Session</span>
                          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                            {sessionDetail.fines.length} fine{sessionDetail.fines.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {sessionDetail.fines.length === 0 ? (
                          <p className="adm-empty">No fines were pending when this session was created.</p>
                        ) : (
                          sessionDetail.fines.map((fine) => {
                            const sc = STATUS_COLORS[fine.status as FineStatus] ?? { bg: "transparent", color: "#8B949E", border: "#30363D" };
                            return (
                              <div key={fine.fine_id} className="adm-fine-row" style={{ borderLeftColor: sc.color }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span className="adm-fine-member">{fine.member_name}</span>
                                    <span style={{ color: "var(--text-dim)" }}>·</span>
                                    <span className="adm-fine-type">{fine.fine_type}</span>
                                  </div>
                                  <p className="adm-fine-desc">{fine.description}</p>
                                  {fine.notes && <p className="adm-fine-notes">{fine.notes}</p>}
                                  <p className="adm-fine-meta">
                                    {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}
                                    {fine.fining_officer ? ` · Officer: ${fine.fining_officer}` : ""}
                                    {fine.amount != null ? ` · $${fine.amount.toFixed(2)}` : ""}
                                  </p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                                  <span className="adm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                                    {fine.status}
                                  </span>
                                  {isPrivileged ? (
                                    <select
                                      value={fine.status}
                                      onChange={(e) => updateSessionFineStatus(sessionDetail.session.id, fine.fine_id, e.target.value as FineStatus)}
                                      className="adm-status-select"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="upheld">Upheld</option>
                                      <option value="dismissed">Dismissed</option>
                                      <option value="overturned">Overturned</option>
                                      <option value="paid">Paid</option>
                                      <option value="labor">Labor</option>
                                    </select>
                                  ) : (
                                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{fine.status}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Changes log */}
                      <div className="adm-card">
                        <div className="adm-card-header">
                          <span className="adm-card-title">Changes This Session</span>
                        </div>
                        <div className="adm-card-body">
                          {sessionDetail.changes.length === 0 ? (
                            <p style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>No changes recorded yet.</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {sessionDetail.changes.map((c) => (
                                <div key={c.id} style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                                  <span style={{ color: "var(--text)", fontWeight: 600 }}>{c.member_name}</span>
                                  {" · "}
                                  <span>{c.fine_type}</span>
                                  {" · "}
                                  <span style={{ color: "var(--text-dim)" }}>{c.old_status}</span>
                                  {" → "}
                                  <span style={{ color: "var(--gold)" }}>{c.new_status}</span>
                                  {" · by "}
                                  <span>{c.changed_by_email}</span>
                                  {" · "}
                                  <span style={{ color: "var(--text-dim)" }}>
                                    {new Date(c.changed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
```

- [ ] **Commit and push**

```bash
git add app/admin/page.tsx
git commit -m "Add Sessions detail view — fines list with status dropdowns and change log"
git push
```

---

## Self-Review Checklist

- [x] Migration creates all three tables with RLS — Task 1
- [x] Types defined before use — Task 2, used in Tasks 9-11
- [x] GET list route returns fine_count — Task 3
- [x] POST create snapshots all pending fines — Task 4
- [x] GET detail joins member name and returns both fines + changes — Task 5
- [x] Close route sets closed_at — Task 6
- [x] update-fine verifies fine is in session, logs to both jp_session_changes and audit_logs — Task 7
- [x] Cron deletes in FK-safe order before deleting fines — Task 8
- [x] Tab visible to all admin roles (not gated by isPrivileged) — Task 9
- [x] Status dropdowns only shown to isPrivileged in session detail — Task 11
- [x] Closed sessions: still editable by owner/root (requireOwner on update-fine, no closed_at check) — Task 7
- [x] Jan 4 cleanup included — Task 8
- [x] `STATUS_COLORS` already defined in admin/page.tsx — used in Task 11 ✓
- [x] Date displayed with noon offset to avoid timezone-off-by-one on date-only strings — Tasks 10, 11
