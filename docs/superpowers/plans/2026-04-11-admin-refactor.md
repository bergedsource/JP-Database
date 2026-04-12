# Admin Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 2,853-line admin page into maintainable tab components, move all client-side DB writes behind API routes, and consolidate fine type definitions.

**Architecture:** Option A — extract each tab as a component that receives shared data via props. Parent page owns data loading and auth state. All mutations go through API routes. Fine types consolidated into one file.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Supabase, Tailwind CSS 4

**Verification:** No test framework exists. Each task is verified with `npm run build` (TypeScript type-checking) and visual spot-checks. No behavioral changes means no new tests needed.

---

## File Map

### New files to create
- `app/admin/admin.css` — extracted admin styles
- `lib/fine-types.ts` — consolidated fine type data
- `app/api/admin/fines/route.ts` — create fines
- `app/api/admin/fines/[id]/route.ts` — delete fine
- `app/api/admin/fines/[id]/status/route.ts` — change fine status
- `app/api/admin/fines/[id]/amount/route.ts` — edit fine amount
- `app/api/admin/fines/outstanding/route.ts` — create upheld fine + optional soc pro
- `app/api/admin/members/route.ts` — create member (POST handler; GET already exists)
- `app/api/admin/members/[id]/status/route.ts` — change member status
- `app/api/admin/social-probation/route.ts` — add social probation
- `app/api/admin/social-probation/[id]/route.ts` — lift social probation
- `app/admin/components/FinesTab.tsx`
- `app/admin/components/OutstandingTab.tsx`
- `app/admin/components/MembersTab.tsx`
- `app/admin/components/SocialProbationTab.tsx`
- `app/admin/components/AuditTab.tsx`
- `app/admin/components/SessionsTab.tsx`
- `app/admin/components/TransitionTab.tsx`
- `app/admin/components/EventsTab.tsx`

### Files to modify
- `app/admin/page.tsx` — reduce from ~2853 lines to ~200 lines (shell only)
- `lib/types.ts` — re-export FineType from fine-types.ts
- `app/api/admin/members/[id]/route.ts` — add DELETE handler

---

## Task 1: Extract Admin CSS

**Files:**
- Create: `app/admin/admin.css`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/admin.css`**

Copy the entire contents of the `<style>` tag from `app/admin/page.tsx` (lines 781–1178, everything between the backticks inside the template literal) into a new CSS file. Remove the `@import url(...)` for fonts — it will go into a `<link>` tag instead.

The CSS file should start with:

```css
/* Admin dashboard styles */

:root {
  --bg: #0D1117;
  --surface: #161B22;
  --surface-2: #1C2128;
  --border: #30363D;
  --border-light: #21262D;
  --gold: #CFB53B;
  --gold-dim: #8A7520;
  --text: #E6EDF3;
  --text-muted: #8B949E;
  --text-dim: #484F58;
  --red: #F87171;
}

.adm-page {
  min-height: 100vh;
  background: var(--bg);
  font-family: 'IBM Plex Sans', sans-serif;
  color: var(--text);
  overflow-x: hidden;
}
/* ... rest of all .adm-* classes exactly as they appear in the <style> tag ... */
```

- [ ] **Step 2: Update `app/admin/page.tsx`**

At the top of the file, add:

```tsx
import "./admin.css";
```

Replace the entire `<style>{...}</style>` block (the JSX element containing the CSS) with a `<link>` tag for the Google Fonts:

```tsx
{/* Before the <div className="adm-page"> */}
<link
  href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: Build succeeds with no errors. The admin page should look identical.

- [ ] **Step 4: Commit**

```bash
git add app/admin/admin.css app/admin/page.tsx
git commit -m "refactor: extract admin CSS into admin.css"
```

---

## Task 2: Consolidate Fine Types

**Files:**
- Create: `lib/fine-types.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Create `lib/fine-types.ts`**

```ts
export const FINE_TYPES = [
  "Conduct Unbecoming (§11-010)",
  "General Misconduct (§11-020)",
  "Misconduct Under Influence (§11-030)",
  "Missing Security at Function (§11-050)",
  "Missing Required Event (§11-060)",
  "Missing Recruitment/Work Week (§11-070)",
  "Removal/Damage to House Property (§11-080)",
  "Removal/Damage to Personal Property (§11-090)",
  "Missing Chapter Meeting (§11-100)",
  "Missing Exec Meeting (§11-110)",
  "Missing Yearbook/Composite (§11-120)",
  "Kitchen Duties (§11-130)",
  "House Clean (§11-140)",
  "Event House Clean (§11-150)",
  "Chores (§11-160)",
  "Missing Philanthropy Event (§11-170)",
  "Smoking (§11-190)",
  "Fire Alarm (§11-200)",
  "Drop Testing Cleanup (§11-210)",
  "Unauthorized Weapon Use (§11-220)",
  "Sexual Relations on Sleeping Porch (§11-230)",
  "Formal Dinner Attire (§11-240)",
  "Grazers (§11-250)",
  "Social Probation Violation (§11-260)",
  "Missing House Philanthropy Event (§11-270)",
  "Missing Signed-Up Philanthropy Event (§11-280)",
  "Bathroom Trash Violation (§11-290)",
  "Physical Violence (§11-300)",
  "Committee Meeting Absence (§7-005)",
  "Missing JP Meeting (§10-220)",
  "Cell Phone in Exec Meeting (§8-060)",
  "Grievance Committee No-Show (§7-030)",
  "Guest Misconduct (§12-030)",
  "Breathalyzer Misuse (§12-080)",
  "Silent Sleeping Porch Violation (§18-350)",
  "Missing Blood Drive (§16-010)",
  "Missing Philanthropy Hours (§16-010)",
  "Vacant Room (§17-020)",
  "Room Improvement Removal (§17-240)",
  "Inadequate Room Space (§17-360)",
  "Failure to Vacate Room (§17-370)",
  "Other",
] as const;

export type FineType = (typeof FINE_TYPES)[number] | (string & {});

export const FINE_DEFAULT_AMOUNTS: Partial<Record<string, number>> = {
  "General Misconduct (§11-020)":                    10,
  "Misconduct Under Influence (§11-030)":             5,
  "Missing Security at Function (§11-050)":           25,
  "Missing Required Event (§11-060)":                 10,
  "Missing Recruitment/Work Week (§11-070)":          35,
  "Missing Chapter Meeting (§11-100)":                10,
  "Missing Exec Meeting (§11-110)":                   5,
  "Missing Yearbook/Composite (§11-120)":             25,
  "Kitchen Duties (§11-130)":                         35,
  "House Clean (§11-140)":                            10,
  "Event House Clean (§11-150)":                      10,
  "Chores (§11-160)":                                 10,
  "Missing Philanthropy Event (§11-170)":             5,
  "Smoking (§11-190)":                                25,
  "Fire Alarm (§11-200)":                             25,
  "Drop Testing Cleanup (§11-210)":                   1,
  "Unauthorized Weapon Use (§11-220)":                5,
  "Sexual Relations on Sleeping Porch (§11-230)":     10,
  "Formal Dinner Attire (§11-240)":                   5,
  "Grazers (§11-250)":                                5,
  "Social Probation Violation (§11-260)":             15,
  "Missing House Philanthropy Event (§11-270)":       50,
  "Missing Signed-Up Philanthropy Event (§11-280)":   25,
  "Bathroom Trash Violation (§11-290)":               5,
  "Physical Violence (§11-300)":                      15,
  "Committee Meeting Absence (§7-005)":               10,
  "Missing JP Meeting (§10-220)":                     15,
  "Cell Phone in Exec Meeting (§8-060)":              5,
  "Grievance Committee No-Show (§7-030)":             25,
  "Guest Misconduct (§12-030)":                       10,
  "Breathalyzer Misuse (§12-080)":                    10,
  "Silent Sleeping Porch Violation (§18-350)":        5,
  "Room Improvement Removal (§17-240)":               60,
  "Inadequate Room Space (§17-360)":                  10,
  "Failure to Vacate Room (§17-370)":                 5,
};

export const FINE_DESCRIPTIONS: Partial<Record<string, string>> = {
  "Conduct Unbecoming (§11-010)": "Conduct unbecoming a member of Acacia Fraternity",
  "General Misconduct (§11-020)": "General misconduct in violation of chapter standards",
  "Misconduct Under Influence (§11-030)": "Misconduct while under the influence of alcohol or substances",
  "Missing Security at Function (§11-050)": "Failed to fulfill assigned security duty at a chapter function",
  "Missing Required Event (§11-060)": "Failed to attend a required chapter event",
  "Missing Recruitment/Work Week (§11-070)": "Failed to participate in recruitment or work week",
  "Removal/Damage to House Property (§11-080)": "Removed or caused damage to house property",
  "Removal/Damage to Personal Property (§11-090)": "Removed or caused damage to another member's personal property",
  "Missing Chapter Meeting (§11-100)": "Failed to attend a required chapter meeting",
  "Missing Exec Meeting (§11-110)": "Failed to attend a required executive board meeting",
  "Missing Yearbook/Composite (§11-120)": "Failed to appear for yearbook or composite photo",
  "Kitchen Duties (§11-130)": "Failed to complete assigned kitchen duties",
  "House Clean (§11-140)": "Failed to participate in scheduled house clean",
  "Event House Clean (§11-150)": "Failed to participate in post-event house clean",
  "Chores (§11-160)": "Failed to complete assigned chores",
  "Missing Philanthropy Event (§11-170)": "Failed to attend a required philanthropy event",
  "Smoking (§11-190)": "Smoking in violation of chapter policy",
  "Fire Alarm (§11-200)": "Caused or contributed to a false fire alarm",
  "Drop Testing Cleanup (§11-210)": "Failed to assist with drop testing cleanup",
  "Unauthorized Weapon Use (§11-220)": "Unauthorized possession or use of a weapon on chapter property",
  "Sexual Relations on Sleeping Porch (§11-230)": "Violation of sleeping porch conduct policy",
  "Formal Dinner Attire (§11-240)": "Failed to meet formal dinner dress code requirements",
  "Grazers (§11-250)": "Eating outside of designated meal times without authorization",
  "Social Probation Violation (§11-260)": "Violated terms of active social probation",
  "Missing House Philanthropy Event (§11-270)": "Failed to attend a required house philanthropy event",
  "Missing Signed-Up Philanthropy Event (§11-280)": "Failed to attend a philanthropy event they signed up for",
  "Bathroom Trash Violation (§11-290)": "Left trash or violation of bathroom cleanliness standards",
  "Physical Violence (§11-300)": "Engaged in physical violence or threatening behavior",
  "Committee Meeting Absence (§7-005)": "Failed to attend an assigned committee meeting",
  "Missing JP Meeting (§10-220)": "Failed to appear at a scheduled JP meeting",
  "Cell Phone in Exec Meeting (§8-060)": "Used cell phone during an executive board meeting",
  "Grievance Committee No-Show (§7-030)": "Failed to appear before the grievance committee",
  "Guest Misconduct (§12-030)": "Guest caused misconduct or violated chapter rules",
  "Breathalyzer Misuse (§12-080)": "Misuse or tampering with chapter breathalyzer equipment",
  "Silent Sleeping Porch Violation (§18-350)": "Violated quiet hours policy on the sleeping porch",
  "Missing Blood Drive (§16-010)": "Failed to attend the required blood drive",
  "Missing Philanthropy Hours (§16-010)": "Failed to complete required philanthropy service hours",
  "Vacant Room (§17-020)": "Left room vacant without proper notification",
  "Room Improvement Removal (§17-240)": "Removed chapter-approved room improvements without authorization",
  "Inadequate Room Space (§17-360)": "Failed to maintain adequate room space per chapter standards",
  "Failure to Vacate Room (§17-370)": "Failed to vacate room by the required date",
  "Other": "",
};
```

- [ ] **Step 2: Update `lib/types.ts`**

Replace the `FineType` union type (lines 25–67) with:

```ts
export type { FineType } from "./fine-types";
```

Keep everything else in `lib/types.ts` unchanged.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: Build succeeds. All existing imports of `FineType` from `@/lib/types` still work.

- [ ] **Step 4: Commit**

```bash
git add lib/fine-types.ts lib/types.ts
git commit -m "refactor: consolidate fine types into lib/fine-types.ts"
```

---

## Task 3: Create Fine Mutation API Routes

**Files:**
- Create: `app/api/admin/fines/route.ts`
- Create: `app/api/admin/fines/[id]/route.ts`
- Create: `app/api/admin/fines/[id]/status/route.ts`
- Create: `app/api/admin/fines/[id]/amount/route.ts`
- Create: `app/api/admin/fines/outstanding/route.ts`

- [ ] **Step 1: Create `app/api/admin/fines/route.ts` (POST — issue fines)**

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { members, fine_type, description, amount, term, date_issued, notes, fining_officer } = await req.json();

  if (!Array.isArray(members) || members.length === 0) {
    return NextResponse.json({ error: "At least one member is required" }, { status: 400 });
  }
  if (!fine_type || !description || !term || !date_issued) {
    return NextResponse.json({ error: "fine_type, description, term, and date_issued are required" }, { status: 400 });
  }

  const service = createServiceClient();

  const rows = members.map((m: { id: string; name: string }) => ({
    member_id: m.id,
    fine_type,
    description,
    amount: amount ? parseFloat(amount) : null,
    status: "pending",
    term,
    date_issued,
    notes: notes || null,
    fining_officer: fining_officer || null,
    created_by_user_id: current.userId,
  }));

  const { error } = await service.from("fines").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const names = members.map((m: { id: string; name: string }) => m.name).join(", ");
  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Issued Fine",
    details: `${fine_type} against ${names} — "${description}" (${term}${amount ? `, $${amount}` : ""})`,
  });

  return NextResponse.json({ success: true, count: rows.length });
}
```

- [ ] **Step 2: Create `app/api/admin/fines/[id]/route.ts` (DELETE)**

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  // Fetch fine details for audit log before deleting
  const { data: fine } = await service
    .from("fines")
    .select("fine_type, term, member_id, members(name)")
    .eq("id", id)
    .single();

  const { error } = await service.from("fines").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (fine) {
    const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Deleted Fine",
      details: `${memberName} — ${fine.fine_type} (${fine.term})`,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create `app/api/admin/fines/[id]/status/route.ts` (PUT)**

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

const VALID_STATUSES = ["pending", "upheld", "dismissed", "overturned", "paid", "labor"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const service = createServiceClient();

  const dateResolved = ["paid", "dismissed", "labor"].includes(status)
    ? new Date().toISOString().split("T")[0]
    : null;

  // Fetch fine for audit log + paid export
  const { data: fine } = await service
    .from("fines")
    .select("fine_type, description, amount, member_id, members(name)")
    .eq("id", id)
    .single();

  const { error } = await service
    .from("fines")
    .update({ status, date_resolved: dateResolved })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (fine) {
    const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Updated Fine Status",
      details: `${memberName} — ${fine.fine_type} changed to "${status}"`,
    });

    // Auto-export when fine is marked paid
    if (status === "paid") {
      // Trigger the existing export-fine route logic internally
      const { data: settings } = await service
        .from("settings")
        .select("key, value")
        .eq("key", "google_spreadsheet_id")
        .single();

      if (settings?.value) {
        // Fire-and-forget to the existing export endpoint
        try {
          const baseUrl = req.nextUrl.origin;
          await fetch(`${baseUrl}/api/admin/export-fine`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              member_name: memberName,
              fine_type: fine.fine_type,
              description: fine.description,
              amount: fine.amount,
              date_resolved: dateResolved,
            }),
          });
        } catch {
          // Export failure should not fail the status update
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create `app/api/admin/fines/[id]/amount/route.ts` (PUT)**

```ts
import { getCurrentRole } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { amount } = await req.json();
  const newAmount = amount != null && amount !== "" ? parseFloat(amount) : null;

  const service = createServiceClient();

  // Check permission: owner/root can edit any, others only their own
  if (current.role !== "owner" && current.role !== "root") {
    const { data: fine } = await service
      .from("fines")
      .select("created_by_user_id")
      .eq("id", id)
      .single();

    if (!fine || fine.created_by_user_id !== current.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Fetch fine for audit log
  const { data: fine } = await service
    .from("fines")
    .select("fine_type, member_id, members(name)")
    .eq("id", id)
    .single();

  const { error } = await service.from("fines").update({ amount: newAmount }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (fine) {
    const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Adjusted Fine Amount",
      details: `${memberName} — ${fine.fine_type}: amount changed to ${newAmount != null ? `$${newAmount.toFixed(2)}` : "none"}`,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Create `app/api/admin/fines/outstanding/route.ts` (POST)**

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { member_id, member_name, fine_type, description, amount, term, date_issued, notes, place_on_soc_pro } = await req.json();

  if (!member_id || !fine_type || !description || !term || !date_issued) {
    return NextResponse.json({ error: "member_id, fine_type, description, term, and date_issued are required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { error } = await service.from("fines").insert({
    member_id,
    fine_type,
    description,
    amount: amount ? parseFloat(amount) : null,
    status: "upheld",
    term,
    date_issued,
    notes: notes || null,
    created_by_user_id: current.userId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from("audit_logs").insert({
    admin_email: current.email,
    action: "Issued Outstanding Fine",
    details: `${member_name ?? "Unknown"} — ${fine_type}${amount ? ` $${amount}` : ""} (${term})`,
  });

  if (place_on_soc_pro) {
    const today = new Date().toISOString().split("T")[0];
    await service.from("social_probation").insert({
      member_id,
      reason: "Outstanding Fines (§10-270)",
      start_date: today,
      source: "manual",
      notes: notes || null,
    });
    await service.from("audit_logs").insert({
      admin_email: current.email,
      action: "Added Social Probation",
      details: `${member_name ?? "Unknown"} — Outstanding Fines (§10-270) (manual, issued with fine)`,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: Build succeeds. All new routes compile without errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/fines/
git commit -m "feat: add API routes for fine mutations (create, delete, status, amount, outstanding)"
```

---

## Task 4: Create Member and Social Probation API Routes

**Files:**
- Create: `app/api/admin/members/route.ts` (add POST handler)
- Modify: `app/api/admin/members/[id]/route.ts` (add DELETE handler)
- Create: `app/api/admin/members/[id]/status/route.ts`
- Create: `app/api/admin/social-probation/route.ts`
- Create: `app/api/admin/social-probation/[id]/route.ts`

- [ ] **Step 1: Create `app/api/admin/members/route.ts` (POST — add member)**

Note: There is no existing `app/api/admin/members/route.ts` — the existing file is `app/api/admin/users/route.ts` (for admin user management). This is a new file.

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, status, roll } = await req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validStatuses = ["active", "pledge", "alumni", "inactive", "resident-advisor", "live-out"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const service = createServiceClient();

  const { error } = await service.from("members").insert({
    name: name.trim(),
    status,
    roll: roll ? parseInt(roll) : null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Added Member",
    details: `${name.trim()} (${status})${roll ? ` — Roll ${roll}` : ""}`,
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Add DELETE handler to `app/api/admin/members/[id]/route.ts`**

Add to the existing file (which already has GET and PUT):

```ts
// Add this import if not present:
import { getCurrentRole } from "@/lib/admin-auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  // Fetch member name for audit log
  const { data: member } = await service
    .from("members")
    .select("name, status")
    .eq("id", id)
    .single();

  // Delete fines first (FK constraint), then member
  await service.from("fines").delete().eq("member_id", id);
  const { error } = await service.from("members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (member) {
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Deleted Member",
      details: `${member.name} (${member.status})`,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create `app/api/admin/members/[id]/status/route.ts` (PUT)**

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();

  const validStatuses = ["active", "pledge", "alumni", "inactive", "resident-advisor", "live-out"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const service = createServiceClient();

  // Fetch current member for audit log
  const { data: member } = await service
    .from("members")
    .select("name, status")
    .eq("id", id)
    .single();

  const { error } = await service.from("members").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (member) {
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Updated Member Status",
      details: `${member.name} changed from "${member.status}" to "${status}"`,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create `app/api/admin/social-probation/route.ts` (POST)**

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { member_id, member_name, reason, notes, start_date, end_date } = await req.json();

  if (!member_id || !reason || !start_date) {
    return NextResponse.json({ error: "member_id, reason, and start_date are required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { error } = await service.from("social_probation").insert({
    member_id,
    reason,
    notes: notes || null,
    start_date,
    end_date: end_date || null,
    source: "manual",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from("audit_logs").insert({
    admin_email: current.email,
    action: "Added Social Probation",
    details: `${member_name ?? "Unknown"} — ${reason}`,
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 5: Create `app/api/admin/social-probation/[id]/route.ts` (DELETE — lifts SP)**

```ts
import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  // Fetch for audit log
  const { data: sp } = await service
    .from("social_probation")
    .select("member_id, reason, members(name)")
    .eq("id", id)
    .single();

  const today = new Date().toISOString().split("T")[0];
  const { error } = await service
    .from("social_probation")
    .update({ end_date: today })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (sp) {
    const memberName = (sp as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    await service.from("audit_logs").insert({
      admin_email: current.email,
      action: "Removed Social Probation",
      details: `${memberName} — ${sp.reason} lifted`,
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/members/ app/api/admin/social-probation/
git commit -m "feat: add API routes for member and social probation mutations"
```

---

## Task 5: Extract Tab Components — FinesTab and OutstandingTab

**Files:**
- Create: `app/admin/components/FinesTab.tsx`
- Create: `app/admin/components/OutstandingTab.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/components/FinesTab.tsx`**

Extract from `page.tsx`:
- The `{tab === "fines" && (...)}` JSX block (lines ~1253–1721)
- All state used only by this tab: `fineForm`, `selectedMembers`, `memberSearch`, `showMemberSuggestions`, `fineSubmitting`, `fineError`, `officerSearch`, `showOfficerSuggestions`, `filterStatus`, `filterMember`, `filterOfficer`, `editingAmountId`, `editingAmountValue`, `customFineTypes`, `showAddBylaw`, `bylawForm`, `bylawSubmitting`, `bylawError`
- All functions used only by this tab: `submitFine`, `updateFineStatus`, `updateFineAmount`, `deleteFine`, `loadCustomFineTypes`
- Import `FINE_TYPES`, `FINE_DEFAULT_AMOUNTS`, `FINE_DESCRIPTIONS` from `@/lib/fine-types` instead of using the local constants

Replace direct Supabase calls with `fetch()` to the new API routes:
- `submitFine` → `POST /api/admin/fines`
- `updateFineStatus` → `PUT /api/admin/fines/[id]/status`
- `updateFineAmount` → `PUT /api/admin/fines/[id]/amount`
- `deleteFine` → `DELETE /api/admin/fines/[id]`

Props interface:

```tsx
import type { Fine, FineStatus, FineType, Member } from "@/lib/types";

interface FinesTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  currentUserId: string | null;
  userRole: "owner" | "admin" | "root" | null;
  refresh: () => Promise<void>;
}

export default function FinesTab({ members, fines, isPrivileged, currentUserId, userRole, refresh }: FinesTabProps) {
  // All fines tab local state and logic here
  // All fines tab JSX here
}
```

The component body is the fines tab JSX cut from `page.tsx`, with `supabase.from(...)` calls replaced by `fetch("/api/admin/fines/...", {...})`. After each successful mutation, call `await refresh()`.

- [ ] **Step 2: Create `app/admin/components/OutstandingTab.tsx`**

Extract from `page.tsx`:
- The `{tab === "outstanding" && (() => {...})()}` JSX block (lines ~1724–1946)
- All state: `outForm`, `outMemberSearch`, `outSelectedMember`, `showOutSuggestions`, `outSubmitting`, `outError`
- `submitOutstandingFine` → `POST /api/admin/fines/outstanding`
- `updateFineStatus` and `updateFineAmount` are also used here (for the fine cards in the grouped view) → same API routes as FinesTab

Props interface:

```tsx
interface OutstandingTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  currentUserId: string | null;
  userRole: "owner" | "admin" | "root" | null;
  refresh: () => Promise<void>;
}
```

- [ ] **Step 3: Update `app/admin/page.tsx`**

Replace the fines and outstanding tab JSX blocks with:

```tsx
import FinesTab from "./components/FinesTab";
import OutstandingTab from "./components/OutstandingTab";

// In the JSX:
{tab === "fines" && (
  <FinesTab
    members={members}
    fines={fines}
    isPrivileged={isPrivileged}
    currentUserId={currentUserId}
    userRole={userRole}
    refresh={loadData}
  />
)}
{tab === "outstanding" && (
  <OutstandingTab
    members={members}
    fines={fines}
    isPrivileged={isPrivileged}
    currentUserId={currentUserId}
    userRole={userRole}
    refresh={loadData}
  />
)}
```

Remove all state and functions that were only used by these two tabs.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/admin/components/FinesTab.tsx app/admin/components/OutstandingTab.tsx app/admin/page.tsx
git commit -m "refactor: extract FinesTab and OutstandingTab components"
```

---

## Task 6: Extract Tab Components — Members and Social Probation

**Files:**
- Create: `app/admin/components/MembersTab.tsx`
- Create: `app/admin/components/SocialProbationTab.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/components/MembersTab.tsx`**

Extract the `{tab === "members" && (...)}` block (lines ~1948–2070).

State: `memberForm`, `memberSubmitting`, `memberError`

Replace:
- `submitMember` → `POST /api/admin/members`
- `updateMemberStatus` → `PUT /api/admin/members/[id]/status`
- `deleteMember` → `DELETE /api/admin/members/[id]`

```tsx
interface MembersTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  refresh: () => Promise<void>;
}
```

- [ ] **Step 2: Create `app/admin/components/SocialProbationTab.tsx`**

Extract the `{tab === "soc pro" && (() => {...})()}` block (lines ~2072–2211).

State: `spForm`, `spMemberSearch`, `spSelectedMember`, `showSpSuggestions`, `spSubmitting`, `spError`

Replace:
- `addSocialProbation` → `POST /api/admin/social-probation`
- `removeSocialProbation` → `DELETE /api/admin/social-probation/[id]`

```tsx
interface SocialProbationTabProps {
  members: Member[];
  socialProbations: SocialProbation[];
  isPrivileged: boolean;
  refresh: () => Promise<void>;
}
```

- [ ] **Step 3: Update `app/admin/page.tsx`**

Import both components and replace the tab blocks:

```tsx
import MembersTab from "./components/MembersTab";
import SocialProbationTab from "./components/SocialProbationTab";

{tab === "members" && (
  <MembersTab members={members} fines={fines} isPrivileged={isPrivileged} refresh={loadData} />
)}
{tab === "soc pro" && (
  <SocialProbationTab members={members} socialProbations={socialProbations} isPrivileged={isPrivileged} refresh={loadData} />
)}
```

Remove the state and functions that were only used by these tabs.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/admin/components/MembersTab.tsx app/admin/components/SocialProbationTab.tsx app/admin/page.tsx
git commit -m "refactor: extract MembersTab and SocialProbationTab components"
```

---

## Task 7: Extract Tab Components — Audit, Events, Sessions

**Files:**
- Create: `app/admin/components/AuditTab.tsx`
- Create: `app/admin/components/EventsTab.tsx`
- Create: `app/admin/components/SessionsTab.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/components/AuditTab.tsx`**

Extract the audit tab block (lines ~2213–2267) including the annual reset countdown.

```tsx
interface AuditTabProps {
  auditLogs: AuditLog[];
}
```

No mutations — this is read-only. No API route changes needed.

- [ ] **Step 2: Create `app/admin/components/EventsTab.tsx`**

Extract the events tab block (lines ~2269–2299).

```tsx
interface EventsTabProps {
  eventLog: AuditLog[];
}
```

Read-only. The parent page still owns `loadEventLog()` and passes the data.

- [ ] **Step 3: Create `app/admin/components/SessionsTab.tsx`**

Extract the sessions tab block (lines ~2302–2516).

State: `sessions`, `sessionView`, `sessionDetail`, `sessionLoading`, `newSessionDate`, `newSessionSubmitting`, `sessionDetailLoading`, `sessionError`

This tab already uses API routes (`/api/admin/sessions`, `/api/admin/sessions/[id]`, etc.) — no route changes needed. Just move the code.

```tsx
interface SessionsTabProps {
  isPrivileged: boolean;
}
```

Sessions loads its own data via `loadSessions()` — it's self-contained.

- [ ] **Step 4: Update `app/admin/page.tsx`**

```tsx
import AuditTab from "./components/AuditTab";
import EventsTab from "./components/EventsTab";
import SessionsTab from "./components/SessionsTab";

{tab === "audit" && isPrivileged && <AuditTab auditLogs={auditLogs} />}
{tab === "events" && userRole === "root" && <EventsTab eventLog={eventLog} />}
{tab === "sessions" && <SessionsTab isPrivileged={isPrivileged} />}
```

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/admin/components/AuditTab.tsx app/admin/components/EventsTab.tsx app/admin/components/SessionsTab.tsx app/admin/page.tsx
git commit -m "refactor: extract AuditTab, EventsTab, and SessionsTab components"
```

---

## Task 8: Extract TransitionTab and Final Cleanup

**Files:**
- Create: `app/admin/components/TransitionTab.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Create `app/admin/components/TransitionTab.tsx`**

Extract the transition/settings tab block (lines ~2519–2845).

State: `adminUsers`, `newUserForm`, `newUserSubmitting`, `newUserError`, `showNewUserPassword`, `venmoForm`, `venmoSaving`, `venmoSaved`, `defaultSheetId`, `defaultSheetSaving`, `defaultSheetSaved`, `showSheetHelp`, `exportTerm`, `exportSheetId`, `exportLoading`, `exportResult`, `exportHistory`, `showExportHelp`

This tab already uses API routes for user management and settings. For `bulkExport`, it already calls `/api/admin/bulk-export`. No new routes needed.

```tsx
interface TransitionTabProps {
  fines: Fine[];
  userRole: "owner" | "admin" | "root" | null;
  currentUserId: string | null;
}
```

The tab owns `loadAdminUsers()`, `loadVenmoSettings()`, `bulkExport()`, `saveVenmo()`, `saveDefaultSheet()`, `createAdminUser()`, `removeAdminUser()`, `transferOwnership()` — all already use fetch() to API routes.

- [ ] **Step 2: Update `app/admin/page.tsx`**

```tsx
import TransitionTab from "./components/TransitionTab";

{tab === "transition" && isPrivileged && (
  <TransitionTab fines={fines} userRole={userRole} currentUserId={currentUserId} />
)}
```

- [ ] **Step 3: Final cleanup of `app/admin/page.tsx`**

Remove:
- All state declarations that have been moved to tab components
- All handler functions that have been moved
- The `FINE_TYPES`, `FINE_DEFAULT_AMOUNTS`, `FINE_DESCRIPTIONS`, `FINE_DESCRIPTIONS` constants (now in `lib/fine-types.ts`)
- The `STATUS_COLORS` constant (moved into whichever tabs use it — FinesTab and OutstandingTab)
- The `SP_REASONS` constant (moved into SocialProbationTab)
- The `getTermOptions()` and `getCurrentTerm()` helpers (moved into the tabs that use them, or into a shared `lib/term-utils.ts` if used by 3+ tabs)
- The `createClient` import from `@/lib/supabase/client` (no longer needed in the parent page — tabs use fetch() instead)
- Any unused type imports

The final `page.tsx` should contain only:
- `"use client"` directive
- Imports for React hooks, router, types, and tab components
- Auth state (`userRole`, `currentUserId`, `adminEmail`, `isPrivileged`)
- Shared data state (`members`, `fines`, `socialProbations`, `auditLogs`, `eventLog`, `loading`, `tab`)
- `loadData()` function
- `loadEventLog()` function
- `signOut()` function
- `useEffect` for initial load + auth check
- JSX: header, tab bar, loading state, conditional tab rendering

Target: ~200 lines.

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds with no errors.

Run: `npm run lint`
Expected: No new lint errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/components/TransitionTab.tsx app/admin/page.tsx
git commit -m "refactor: extract TransitionTab, complete admin page decomposition

Admin page reduced from 2853 lines to ~200 lines.
All mutations now go through API routes.
Fine types consolidated in lib/fine-types.ts."
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Admin page loads and shows all tabs
- [ ] Fines tab: can issue a fine, edit amount, change status, delete
- [ ] Outstanding tab: can add outstanding fine, view grouped by member
- [ ] Members tab: can add member, change status, delete
- [ ] Social Probation tab: can add, can lift
- [ ] Sessions tab: can create session, view detail, close session, change fine status in session
- [ ] Audit tab: shows log entries
- [ ] Transition tab: user management, payment info, export all work
- [ ] Public page still works (search, view fines, payment links)
