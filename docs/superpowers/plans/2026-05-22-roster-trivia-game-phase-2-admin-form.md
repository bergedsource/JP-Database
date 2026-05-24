# Chapter Trivia Game — Phase 2: Admin Big-Bro Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional "Big Brother" autocomplete to the admin "Add Member" form, wire it through the members POST route to write/update `chapter_roster`, and expose a roster-search API for the autocomplete UI.

**Architecture:** Three pieces. (1) A new `GET /api/admin/roster/search` endpoint (owner-only, rate-limited, substring match on `chapter_roster.name`, returns up to 8 hits). (2) `POST /api/admin/members` extended to accept `big_brother_roll`, validate it exists in `chapter_roster`, and either insert a fresh roster row (new roll #) or update the existing one. **Deviation from spec § "Admin Form Change":** when the admin explicitly picks a big bro and the existing `chapter_roster.big_brother_roll` is non-null and different, we OVERWRITE (the spec said leave-alone). Old → new is recorded in `audit_logs`. (3) `MembersTab` form gains a search-as-you-type input between Roll # and Status, mirroring the member-search pattern already used in `FinesTab`.

**Tech Stack:** Next.js 16 App Router (params are Promises), TypeScript, Supabase service client, `@upstash/ratelimit`, existing `requireOwner()` / `getCurrentRole()` helpers.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/api/admin/roster/search/route.ts` | NEW | GET handler for big-bro autocomplete. Owner-only. Substring match on name. |
| `app/api/admin/members/route.ts` | MODIFIED | Accept `big_brother_roll`, validate against `chapter_roster`, insert/update roster row, audit-log overwrites. |
| `app/admin/components/MembersTab.tsx` | MODIFIED | New autocomplete field in the "Add Member" form. |
| `lib/types.ts` | UNCHANGED | `ChapterRosterEntry` already exists from Phase 1 (line 101). |

---

## Task 1: Autocomplete API route

**Files:**
- Create: `app/api/admin/roster/search/route.ts`

- [ ] **Step 1.1: Create the route file**

Create `app/api/admin/roster/search/route.ts` with:

```ts
import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] });
  if (q.length > 64) return NextResponse.json({ error: "Query too long" }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("chapter_roster")
    .select("roll, name, initiation_class")
    .ilike("name", `%${q}%`)
    .order("roll", { ascending: true })
    .limit(8);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ results: data ?? [] });
}
```

- [ ] **Step 1.2: Manual test — unauthenticated**

In the dev server, hit `GET /api/admin/roster/search?q=jones` from a logged-out browser tab.
Expected: 401 from `proxy.ts` (admin API protection).

- [ ] **Step 1.3: Manual test — admin role (read-only)**

Log in as an `admin`-role user, hit the endpoint.
Expected: 403 from `requireOwner()`.

- [ ] **Step 1.4: Manual test — owner role, valid query**

Log in as `owner` or `root`, hit `GET /api/admin/roster/search?q=smith` in the browser address bar.
Expected: JSON with up to 8 results, each `{roll, name, initiation_class}`, sorted by roll ascending.

- [ ] **Step 1.5: Manual test — empty query**

Hit `GET /api/admin/roster/search?q=`.
Expected: `{"results": []}` (no DB query fired — return-early path).

- [ ] **Step 1.6: Commit**

```bash
git add app/api/admin/roster/search/route.ts
git commit -m "feat(admin): add chapter_roster autocomplete endpoint for big-bro picker"
```

---

## Task 2: Wire `big_brother_roll` through `POST /api/admin/members`

**Files:**
- Modify: `app/api/admin/members/route.ts`

- [ ] **Step 2.1: Extend request body destructuring + validation**

Replace lines 17–26 of `app/api/admin/members/route.ts` with:

```ts
  const { name, status, roll, big_brother_roll } = await req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validStatuses = ["active", "pledge", "alumni", "inactive", "resident-advisor", "live-out"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const parsedRoll = roll ? parseInt(roll) : null;
  if (roll && (!Number.isFinite(parsedRoll) || parsedRoll! < 1 || parsedRoll! > 99999)) {
    return NextResponse.json({ error: "Invalid roll number" }, { status: 400 });
  }

  let bbRoll: number | null = null;
  if (big_brother_roll != null) {
    if (!Number.isInteger(big_brother_roll) || big_brother_roll < 1 || big_brother_roll > 99999) {
      return NextResponse.json({ error: "Invalid big_brother_roll" }, { status: 400 });
    }
    bbRoll = big_brother_roll;
  }
```

- [ ] **Step 2.2: Validate big_brother_roll exists in chapter_roster**

Insert immediately after the `bbRoll` validation block:

```ts
  const service = createServiceClient();

  if (bbRoll != null) {
    const { data: bbExists } = await service
      .from("chapter_roster")
      .select("roll")
      .eq("roll", bbRoll)
      .maybeSingle();
    if (!bbExists) {
      return NextResponse.json({ error: "Big brother roll # not found in chapter roster" }, { status: 400 });
    }
  }
```

Then DELETE the existing `const service = createServiceClient();` line below — it's been moved up.

- [ ] **Step 2.3: Replace the member insert to use `parsedRoll`**

Replace the existing `service.from("members").insert(...)` block with:

```ts
  const { error } = await service.from("members").insert({
    name: name.trim(),
    status,
    roll: parsedRoll,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
```

- [ ] **Step 2.4: Add the chapter_roster insert/update logic with overwrite policy**

Insert this block AFTER the member insert succeeds (i.e. after `if (error) return ...`) and BEFORE the existing audit-log insert:

```ts
  let rosterAction: "none" | "inserted" | "updated_filled_null" | "updated_overwrote" = "none";
  let rosterOverwriteFrom: number | null = null;

  if (parsedRoll != null) {
    const { data: existingRoster } = await service
      .from("chapter_roster")
      .select("roll, big_brother_roll")
      .eq("roll", parsedRoll)
      .maybeSingle();

    if (!existingRoster) {
      const { error: rosterErr } = await service.from("chapter_roster").insert({
        roll: parsedRoll,
        name: name.trim(),
        initiation_class: `New (${status})`,
        initiation_date: new Date().toISOString().slice(0, 10),
        big_brother_roll: bbRoll,
        notes: null,
      });
      if (rosterErr) {
        return NextResponse.json({ error: `Roster write failed: ${rosterErr.message}` }, { status: 500 });
      }
      rosterAction = "inserted";
    } else if (bbRoll != null) {
      // Admin explicitly picked a big bro — write it, even if a value was already there.
      if (existingRoster.big_brother_roll == null) {
        rosterAction = "updated_filled_null";
      } else if (existingRoster.big_brother_roll !== bbRoll) {
        rosterAction = "updated_overwrote";
        rosterOverwriteFrom = existingRoster.big_brother_roll;
      }
      // If existingRoster.big_brother_roll === bbRoll, no-op (rosterAction stays "none").

      if (rosterAction !== "none") {
        const { error: rosterErr } = await service
          .from("chapter_roster")
          .update({ big_brother_roll: bbRoll })
          .eq("roll", parsedRoll);
        if (rosterErr) {
          return NextResponse.json({ error: `Roster update failed: ${rosterErr.message}` }, { status: 500 });
        }
      }
    }
    // If existingRoster exists and bbRoll is null, leave the row untouched.
  }
```

**Note on atomicity:** if the roster write fails AFTER the member row was inserted, we return 500 but leave the member row in place. This is acceptable for v1 — the admin will see the error, retry the add, and the existing member-roll uniqueness (none currently enforced) plus the early `chapter_roster.roll` PK check on the second pass will surface the duplicate. Documented as known limitation in the spec's "Open Items" if it bites in practice.

- [ ] **Step 2.5: Extend the audit log details to include big bro info**

Replace the existing audit log insert with:

```ts
  const table = current.role === "root" ? "system_events" : "audit_logs";

  let bbDetails = "";
  if (rosterAction === "updated_overwrote") {
    bbDetails = ` — Big Bro: #${bbRoll} (overwrote prior #${rosterOverwriteFrom})`;
  } else if (rosterAction === "updated_filled_null" || rosterAction === "inserted") {
    if (bbRoll != null) bbDetails = ` — Big Bro: #${bbRoll}`;
  }

  await service.from(table).insert({
    admin_email: current.email,
    action: "Added Member",
    details: `${name.trim()} (${status})${parsedRoll ? ` — Roll ${parsedRoll}` : ""}${bbDetails}`,
  });
```

- [ ] **Step 2.6: Manual test — no roll, no big bro (backward compat)**

In dev: open admin → Members tab → add `"Test NoRoll Alumni"` with status alumni, no roll, no big bro. Submit.
Expected: 200; `members` row exists; no `chapter_roster` row created; audit log says `"Test NoRoll Alumni (alumni)"`.

- [ ] **Step 2.7: Manual test — roll set, no big bro, fresh roll #**

Add `"Test FreshRoll"` with roll 9001 (or any number not in `chapter_roster`), status active, big bro left blank.
Expected: `members` row + new `chapter_roster` row (roll=9001, name="Test FreshRoll", initiation_class="New (active)", initiation_date=today, big_brother_roll=null). Audit detail: `"... — Roll 9001"`.

Verify via Supabase SQL Editor:
```sql
SELECT * FROM chapter_roster WHERE roll = 9001;
```

- [ ] **Step 2.8: Manual test — big bro picked, existing roll, prior bb was null**

Find a roll in `chapter_roster` with `big_brother_roll IS NULL`:
```sql
SELECT roll, name FROM chapter_roster WHERE big_brother_roll IS NULL LIMIT 3;
```

Add a new member through the form, set the new member's roll to one of those rolls (yes, this is the "merge an existing roster entry with a new fines-system member" case). Pick any valid big bro.
Expected: `members` row inserted, `chapter_roster` row UPDATED with the new `big_brother_roll`. Audit detail: `"... — Big Bro: #<n>"`. The roster row's name/initiation_class are NOT overwritten.

- [ ] **Step 2.9: Manual test — big bro picked, existing roll, prior bb was different (the overwrite case)**

Find a roll where big_brother_roll IS NOT NULL:
```sql
SELECT roll, name, big_brother_roll FROM chapter_roster WHERE big_brother_roll IS NOT NULL LIMIT 3;
```

Add a new member with that roll, pick a DIFFERENT big bro.
Expected: roster row's `big_brother_roll` overwritten to new value. Audit detail: `"... — Big Bro: #<new> (overwrote prior #<old>)"`. Verify the old and new values are both in the audit log.

- [ ] **Step 2.10: Manual test — invalid big bro**

POST manually via curl with a big_brother_roll that doesn't exist (e.g., 88888):
```bash
curl -X POST http://localhost:3000/api/admin/members -H "Content-Type: application/json" -H "Cookie: <session>" -d '{"name":"X","status":"active","roll":"9002","big_brother_roll":88888}'
```
Expected: 400, error message `"Big brother roll # not found in chapter roster"`. No member row created.

- [ ] **Step 2.11: Commit**

```bash
git add app/api/admin/members/route.ts
git commit -m "feat(admin): accept big_brother_roll on member POST, write through to chapter_roster with audit-logged overwrite"
```

---

## Task 3: Big Brother autocomplete in MembersTab

**Files:**
- Modify: `app/admin/components/MembersTab.tsx`

- [ ] **Step 3.1: Extend form state**

In `MembersTab.tsx`, replace the `memberForm` initialization (currently lines 14–18) with:

```tsx
  const [memberForm, setMemberForm] = useState({
    name: "",
    status: "active" as Member["status"],
    roll: "",
    big_brother_roll: null as number | null,
    big_brother_name: "" as string,
  });
  const [bbSearch, setBbSearch] = useState("");
  const [bbResults, setBbResults] = useState<Array<{ roll: number; name: string; initiation_class: string | null }>>([]);
  const [showBbSuggestions, setShowBbSuggestions] = useState(false);
```

- [ ] **Step 3.2: Add the autocomplete fetch effect**

Add this near the other hooks (right after the `bbSearch`/`bbResults`/`showBbSuggestions` declarations from Step 3.1). Don't forget to import `useEffect`:

Update the import at the top of the file:
```tsx
import { useState, useEffect } from "react";
```

Then add the effect:
```tsx
  useEffect(() => {
    const q = bbSearch.trim();
    if (!q || memberForm.big_brother_roll != null) {
      setBbResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/roster/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setBbResults([]);
          return;
        }
        const data = await res.json();
        setBbResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setBbResults([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [bbSearch, memberForm.big_brother_roll]);
```

- [ ] **Step 3.3: Update the submit handler to send big_brother_roll**

Replace the existing `fetch("/api/admin/members", ...)` body in `submitMember` with:

```tsx
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: memberForm.name.trim(),
        status: memberForm.status,
        roll: memberForm.roll,
        big_brother_roll: memberForm.big_brother_roll,
      }),
    });
```

And update the success-path reset (currently `setMemberForm({ name: "", status: "active", roll: "" })`) to:

```tsx
      setMemberForm({ name: "", status: "active", roll: "", big_brother_roll: null, big_brother_name: "" });
      setBbSearch("");
      setBbResults([]);
```

- [ ] **Step 3.4: Add the autocomplete UI between Roll # and Status**

In the JSX, locate the Roll # `<div>` (currently lines 118–128). AFTER its closing `</div>` and BEFORE the Status `<div>`, insert:

```tsx
            <div style={{ position: "relative", minWidth: 220 }}>
              <label className="adm-label">Big Brother (optional)</label>
              {memberForm.big_brother_roll != null ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    className="adm-input"
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", paddingRight: 8 }}
                  >
                    {memberForm.big_brother_name} <span style={{ color: "var(--text-dim)", marginLeft: 6, fontSize: 12 }}>#{memberForm.big_brother_roll}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMemberForm({ ...memberForm, big_brother_roll: null, big_brother_name: "" });
                      setBbSearch("");
                      setBbResults([]);
                    }}
                    aria-label="Clear big brother"
                    title="Clear"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4, fontSize: 16, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={bbSearch}
                    onChange={(e) => {
                      setBbSearch(e.target.value);
                      setShowBbSuggestions(true);
                    }}
                    onFocus={() => setShowBbSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowBbSuggestions(false), 150)}
                    placeholder="Search roster…"
                    className="adm-input"
                    autoComplete="off"
                    style={{ width: "100%" }}
                  />
                  {showBbSuggestions && bbResults.length > 0 && (
                    <ul className="adm-suggestions">
                      {bbResults.map((r) => (
                        <li key={r.roll}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setMemberForm({
                                ...memberForm,
                                big_brother_roll: r.roll,
                                big_brother_name: r.name,
                              });
                              setBbSearch("");
                              setBbResults([]);
                              setShowBbSuggestions(false);
                            }}
                            className="adm-suggestion-btn"
                          >
                            <span className="adm-suggestion-name">{r.name}</span>
                            <span className="adm-suggestion-status">
                              #{r.roll}{r.initiation_class ? ` · ${r.initiation_class}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
```

The `onMouseDown` `preventDefault` on the suggestion button is intentional — it stops the input's `onBlur` from firing before the click registers (the same bug FinesTab works around with `setTimeout(..., 150)`).

- [ ] **Step 3.5: Verify in the browser (golden path)**

Run the dev server (`npm run dev`), open `/admin`, log in as owner, go to Members tab.

1. Type "smith" in the Big Brother input.
2. Wait ~150ms — suggestions list appears showing matches.
3. Click one — input is replaced with `Name #roll` + an `×` clear button.
4. Click `×` — selection clears, you can search again.
5. Type a name, pick from list, fill in Full Name + Status + Roll, submit.
6. Verify success: form clears, member appears in the table.
7. Verify in Supabase: the `chapter_roster` row for that roll exists with the picked `big_brother_roll`.

- [ ] **Step 3.6: Verify edge case — submit without big bro still works**

Fill in Full Name + Status only, leave Big Brother empty, submit.
Expected: member created with no big bro reference (consistent with pre-Phase-2 behavior).

- [ ] **Step 3.7: Verify edge case — non-owner can't see suggestions**

If you have an `admin`-role test user available: log in, go to Members tab.
Expected: the form is not visible to admins (`isPrivileged` check at line 101 hides the entire form). If somehow exposed, the autocomplete fetch returns 403 and the dropdown stays empty.

- [ ] **Step 3.8: Commit**

```bash
git add app/admin/components/MembersTab.tsx
git commit -m "feat(admin): add big-brother autocomplete field to Add Member form"
```

---

## Self-Review Notes

- **Spec coverage:** Phase 2 scope per spec §"Admin Form Change" + §"API Endpoints" covered by Tasks 1–3.
- **Deviation:** Overwrite policy differs from spec (admin pick wins instead of "leave it"). Justified in plan header; audit-logged.
- **Atomicity gap:** member-insert + roster-write are not transactional. Acknowledged in Task 2.4 note.
- **No automated tests:** matches the existing codebase pattern (per CLAUDE.md). All verification is manual via dev server + Supabase SQL Editor.
- **Out of scope for Phase 2:** game UI, leaderboard, public APIs (Phase 3); admin cleanup tool (Phase 4); feature gate (`game_enabled` settings flag — not needed until Phase 3 ships UI surfaces).

---

## Future Memory Update (after Phase 2 ships)

Update `project_fines_website.md` `## Session Changes (2026-05-21)` entry to note:
- Phase 2 shipped with overwrite policy (deviation from original spec)
- Audit-log entries for overwrites use format `Added Member: <name> (...) — Big Bro: #<new> (overwrote prior #<old>)`
- Files added/modified: roster search route + members POST + MembersTab form
