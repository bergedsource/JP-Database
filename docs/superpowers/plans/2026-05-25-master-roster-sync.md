# Master Roster Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-sync the Master Roll Numbers Google Sheet into `chapter_roster` (upsert all rows) and `members` (insert new active members only). Runs daily on the existing cron + on-demand from a new "Master Roster Sync" card in the Transition tab, with a dry-run preview.

**Architecture:** A single pure function `syncMasterRoster()` in `lib/sync-roster.ts` is the only place that does the work. Three callers wrap it: the daily cron at 23:59 UTC, `POST /api/admin/sync-roster` (real sync), and the same endpoint with `?dry=1` (preview). Defaults for the spreadsheet ID and tab name are hardcoded constants in `lib/sync-roster.ts`; if a `settings` row exists with the same key, it overrides the constant (mirrors the `google_spreadsheet_id` pattern already used for fines export).

**Tech Stack:** Next.js 16 App Router (params are Promises), TypeScript, Supabase service client, `googleapis` (already a dependency, already used for the fines export), `@upstash/ratelimit`, existing `requireOwner()` + `adminLimiter` helpers.

**Spec reference:** `docs/superpowers/specs/2026-05-25-master-roster-sync-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `lib/sync-roster.ts` | NEW | Pure sync function: parse sheet, diff vs DB, upsert chapter_roster, insert new members. Returns summary. |
| `app/api/admin/sync-roster/route.ts` | NEW | POST handler, owner-only, rate-limited, supports `?dry=1`. |
| `app/api/cron/route.ts` | MODIFIED | New try/catch block at the end calling `syncMasterRoster()`. |
| `app/api/admin/settings/route.ts` | MODIFIED | Add 3 keys to `ALLOWED_KEYS`. |
| `app/admin/components/TransitionTab.tsx` | MODIFIED | New "Master Roster Sync" card with last-synced indicator, Dry-run + Run Now buttons, result modal. |
| `scripts/sheet-preflight.ts` | NEW (throwaway) | One-shot script to fetch the master sheet and print its actual tab name + row-1 headers. Run once before Task 5. |

---

## Task 1: Pull Google env vars to local `.env.local`

The sync function uses `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`. These are set in Vercel but NOT in your local `.env.local`. You need them locally to run the preflight and dev-server testing.

**Files:**
- Modify: `.env.local` (gitignored — not committed)

- [ ] **Step 1.1: Open Vercel dashboard → project → Settings → Environment Variables**

Reveal these THREE values:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — should be `acacia-jp-sheets@jp-database-491921.iam.gserviceaccount.com`
- `GOOGLE_PRIVATE_KEY` — long multi-line key starting with `-----BEGIN PRIVATE KEY-----`
- `CRON_SECRET` — needed only for the local cron test in Task 7.4. If you skip that test, you can skip this value.

- [ ] **Step 1.2: Append to `.env.local`**

Paste these at the bottom (replace `<VALUE>` with the actual reveals):

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=acacia-jp-sheets@jp-database-491921.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="<paste the full key including BEGIN/END lines, with the \n escapes preserved as-is>"
CRON_SECRET=<paste cron secret>
```

The key in Vercel is stored with literal `\n` for newlines — keep it that way; `lib/export-to-sheets.ts:36` already has `.replace(/\\n/g, "\n")` for runtime decoding.

- [ ] **Step 1.3: Verify nothing else broke**

```bash
npm run dev
```

Expected: dev server starts on localhost:3000 with no env-var errors. Stop with Ctrl+C.

**No commit** — `.env.local` is gitignored.

---

## Task 2: Share master sheet with the service account

**Files:** none (Google Sheets manual step)

- [ ] **Step 2.1: Open the master sheet**

Navigate to `https://docs.google.com/spreadsheets/d/10BRo_2eek0hVUFqqYmV2sgORPMe--KF1XKhaLm9DnbY/edit`

- [ ] **Step 2.2: Click Share (top right) → add email**

Paste `acacia-jp-sheets@jp-database-491921.iam.gserviceaccount.com`. Set role to **Viewer** (not Editor — read-only is sufficient and safer). **Uncheck** "Notify people" (service accounts don't have inboxes). Click Share.

- [ ] **Step 2.3: Confirm by visiting Share again**

The service account email should now appear in the access list as "Viewer".

**No commit.**

---

## Task 3: Preflight — fetch actual sheet structure

Before locking constants into the sync code, fetch the real sheet via the Sheets API and verify the tab name and header-row text match what the spec assumes.

**Files:**
- Create: `scripts/sheet-preflight.ts` (throwaway — delete after Task 5)

- [ ] **Step 3.1: Create the preflight script**

Create `scripts/sheet-preflight.ts`:

```ts
// One-shot preflight: prints the tab list + row-1 headers for the master sheet.
// Run: npx tsx scripts/sheet-preflight.ts
// Reads GOOGLE_* + spreadsheet ID from .env.local.

import { google } from "googleapis";
import { config } from "dotenv";

config({ path: ".env.local" });

const SPREADSHEET_ID = "10BRo_2eek0hVUFqqYmV2sgORPMe--KF1XKhaLm9DnbY";

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // 1. List all tabs/sheets in the spreadsheet
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  console.log("\nTabs in this spreadsheet:");
  for (const s of meta.data.sheets ?? []) {
    console.log(`  - "${s.properties?.title}" (sheetId=${s.properties?.sheetId})`);
  }

  // 2. For each tab, read row 1 (headers)
  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title;
    if (!title) continue;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1:Z1`,
    });
    const headers = res.data.values?.[0] ?? [];
    console.log(`\nHeaders in "${title}" (row 1):`);
    headers.forEach((h, i) => console.log(`  Col ${String.fromCharCode(65 + i)}: ${JSON.stringify(h)}`));
  }

  // 3. Also dump the first 3 data rows so we can sanity-check column ordering
  const firstTab = meta.data.sheets?.[0]?.properties?.title;
  if (firstTab) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${firstTab}!A2:Z4`,
    });
    console.log(`\nFirst 3 data rows in "${firstTab}":`);
    for (const row of res.data.values ?? []) {
      console.log("  " + JSON.stringify(row));
    }
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
```

- [ ] **Step 3.2: Install `dotenv` if not already present**

```bash
npm list dotenv
```

If "(empty)" or "not found":

```bash
npm install --save-dev dotenv
```

(The existing `scripts/import-chapter-roster.ts:13` already imports `dotenv`, so it should be installed.)

- [ ] **Step 3.3: Run preflight**

```bash
npx tsx scripts/sheet-preflight.ts
```

Expected output structure:
```
Tabs in this spreadsheet:
  - "Sheet1" (sheetId=132014347)

Headers in "Sheet1" (row 1):
  Col A: "#"
  Col B: "Name:"
  Col C: "Initiation Class:"
  Col D: "Initiation Date:"
  Col E: "Big Bro:"
  Col F: "Venerable Dean / Other:"

First 3 data rows in "Sheet1":
  ["1","Charles A. Brown","1894","4/19/1894","",""]
  ...
```

- [ ] **Step 3.4: Record actual values**

Write down (or paste in chat) the EXACT:
- Tab name (e.g. `Sheet1` vs `sheet1` vs `Master`)
- The 6 header strings, character-for-character (case + colons matter)

These are the values you'll plug into `EXPECTED_HEADERS` and `DEFAULT_SHEET_NAME` in Task 5.

- [ ] **Step 3.5: If headers do NOT match what the spec assumed**

The spec assumed: `#`, `Name:`, `Initiation Class:`, `Initiation Date:`, `Big Bro:`, `Venerable Dean / Other:`. If any differ, that's fine — just use the real values in Task 5's `EXPECTED_HEADERS` constant. No need to edit the spec.

If the headers are wildly different (e.g., reordered columns, missing required columns), STOP here and report back — Task 5 will need rework.

**No commit yet** — preflight script gets committed at end of Task 5 (it's useful for future debugging but kept out of the main path).

---

## Task 4: Allow new settings keys

Extend the settings PUT allowlist so admins can override the spreadsheet ID / tab name from the Transition tab UI later.

**Files:**
- Modify: `app/api/admin/settings/route.ts:29`

- [ ] **Step 4.1: Add three keys to ALLOWED_KEYS**

Edit `app/api/admin/settings/route.ts:29` — change:

```ts
const ALLOWED_KEYS = ["venmo_handle", "venmo_url", "export_history", "google_spreadsheet_id", "game_enabled"];
```

to:

```ts
const ALLOWED_KEYS = [
  "venmo_handle",
  "venmo_url",
  "export_history",
  "google_spreadsheet_id",
  "game_enabled",
  "master_roster_spreadsheet_id",
  "master_roster_sheet_name",
  "last_roster_sync_at",
];
```

- [ ] **Step 4.2: Build check**

```bash
npm run build
```

Expected: success, no type errors.

- [ ] **Step 4.3: Commit**

```bash
git add app/api/admin/settings/route.ts
git commit -m "feat(settings): allow master_roster_* keys"
```

---

## Task 5: Build core sync function

This is the load-bearing task. The function is pure (no HTTP, no cron — those wrap it), and it supports a dry-run mode that returns the full diff without writing.

**Files:**
- Create: `lib/sync-roster.ts`

- [ ] **Step 5.1: Create the file**

Create `lib/sync-roster.ts`. **Important:** before writing this, plug the real header strings + tab name you captured in Task 3.4 into the `EXPECTED_HEADERS` array and `DEFAULT_SHEET_NAME` constant below. The code as written assumes the spec defaults; replace if Task 3.4 showed different values.

```ts
import { google, sheets_v4 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";

// Defaults. Settings table rows with the same keys override these at runtime.
const DEFAULT_SPREADSHEET_ID = "10BRo_2eek0hVUFqqYmV2sgORPMe--KF1XKhaLm9DnbY";
const DEFAULT_SHEET_NAME = "Sheet1"; // <-- replace with actual tab name from Task 3.4 if different

// Header text the sync looks for in row 1. Case + punctuation must match exactly.
// <-- replace any of these strings with actual headers from Task 3.4 if different.
const HEADER_ROLL = "#";
const HEADER_NAME = "Name:";
const HEADER_INIT_CLASS = "Initiation Class:";
const HEADER_INIT_DATE = "Initiation Date:";
const HEADER_BIG_BRO = "Big Bro:";
const HEADER_NOTES = "Venerable Dean / Other:";

const REQUIRED_HEADERS = [HEADER_ROLL, HEADER_NAME] as const;

export type SyncIssue = { roll: number | null; reason: string };
export type SyncSummary = {
  rowsOnSheet: number;
  rosterAdded: number;
  rosterUpdated: number;
  membersAdded: Array<{ roll: number; name: string }>;
  issues: SyncIssue[];
  durationMs: number;
  dryRun: boolean;
};

type ParsedRow = {
  roll: number;
  name: string;
  initiation_class: string | null;
  initiation_date: string | null;
  big_brother_roll: number | null;
  notes: string | null;
};

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseBigBroRoll(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/\s(\d+)\s*$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

async function readSettings(
  service: SupabaseClient
): Promise<{ spreadsheetId: string; sheetName: string }> {
  const { data } = await service
    .from("settings")
    .select("key, value")
    .in("key", ["master_roster_spreadsheet_id", "master_roster_sheet_name"]);
  const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    spreadsheetId: (map.get("master_roster_spreadsheet_id") ?? "").trim() || DEFAULT_SPREADSHEET_ID,
    sheetName: (map.get("master_roster_sheet_name") ?? "").trim() || DEFAULT_SHEET_NAME,
  };
}

function buildSheetsClient(): sheets_v4.Sheets {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

function parseSheet(rows: string[][]): { parsed: ParsedRow[]; issues: SyncIssue[] } {
  const issues: SyncIssue[] = [];
  if (rows.length === 0) {
    issues.push({ roll: null, reason: "Sheet is empty" });
    return { parsed: [], issues };
  }

  const headerRow = rows[0] ?? [];
  const colIndex = (header: string): number => headerRow.findIndex((h) => h === header);

  // Verify required headers are present
  for (const h of REQUIRED_HEADERS) {
    if (colIndex(h) === -1) {
      issues.push({ roll: null, reason: `Missing required column header: "${h}"` });
    }
  }
  if (issues.length > 0) return { parsed: [], issues };

  const idxRoll = colIndex(HEADER_ROLL);
  const idxName = colIndex(HEADER_NAME);
  const idxInitClass = colIndex(HEADER_INIT_CLASS);
  const idxInitDate = colIndex(HEADER_INIT_DATE);
  const idxBigBro = colIndex(HEADER_BIG_BRO);
  const idxNotes = colIndex(HEADER_NOTES);

  const parsed: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rollRaw = row[idxRoll]?.trim();
    if (!rollRaw) continue; // blank padding row — skip silently
    const roll = parseInt(rollRaw, 10);
    if (!Number.isInteger(roll)) {
      issues.push({ roll: null, reason: `Row ${i + 1}: non-integer roll "${rollRaw}"` });
      continue;
    }
    const name = (row[idxName] ?? "").trim();
    if (!name) {
      issues.push({ roll, reason: `Row ${i + 1}: missing name` });
      continue;
    }
    parsed.push({
      roll,
      name,
      initiation_class: idxInitClass >= 0 ? ((row[idxInitClass] ?? "").trim() || null) : null,
      initiation_date: idxInitDate >= 0 ? parseDate(row[idxInitDate]) : null,
      big_brother_roll: idxBigBro >= 0 ? parseBigBroRoll(row[idxBigBro]) : null,
      notes: idxNotes >= 0 ? ((row[idxNotes] ?? "").trim() || null) : null,
    });
  }

  return { parsed, issues };
}

function validateBigBros(rows: ParsedRow[]): { valid: ParsedRow[]; issues: SyncIssue[] } {
  const rollSet = new Set(rows.map((r) => r.roll));
  const issues: SyncIssue[] = [];
  const valid: ParsedRow[] = [];

  for (const r of rows) {
    if (r.big_brother_roll == null) {
      valid.push(r);
      continue;
    }
    if (r.big_brother_roll === r.roll) {
      issues.push({ roll: r.roll, reason: `self-reference (bb=${r.big_brother_roll})` });
      valid.push({ ...r, big_brother_roll: null });
      continue;
    }
    if (!rollSet.has(r.big_brother_roll)) {
      issues.push({ roll: r.roll, reason: `big_brother_roll ${r.big_brother_roll} not found in sheet` });
      valid.push({ ...r, big_brother_roll: null });
      continue;
    }
    valid.push(r);
  }
  return { valid, issues };
}

export async function syncMasterRoster(args: {
  service: SupabaseClient;
  dryRun: boolean;
}): Promise<SyncSummary> {
  const start = Date.now();
  const { service, dryRun } = args;
  const issues: SyncIssue[] = [];
  let rosterAdded = 0;
  let rosterUpdated = 0;
  const membersAdded: Array<{ roll: number; name: string }> = [];

  // 1. Read settings
  const { spreadsheetId, sheetName } = await readSettings(service);
  if (!spreadsheetId) {
    issues.push({ roll: null, reason: "master_roster_spreadsheet_id is not configured" });
    return { rowsOnSheet: 0, rosterAdded: 0, rosterUpdated: 0, membersAdded: [], issues, durationMs: Date.now() - start, dryRun };
  }

  // 2. Fetch sheet
  const sheets = buildSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:F`,
  });
  const rows = (res.data.values ?? []) as string[][];

  // 3. Parse
  const { parsed, issues: parseIssues } = parseSheet(rows);
  issues.push(...parseIssues);
  if (parseIssues.some((i) => i.roll === null)) {
    // Hard failure on header issues — abort before any writes
    return { rowsOnSheet: rows.length, rosterAdded: 0, rosterUpdated: 0, membersAdded: [], issues, durationMs: Date.now() - start, dryRun };
  }

  // 4. Validate big bros
  const { valid, issues: bbIssues } = validateBigBros(parsed);
  issues.push(...bbIssues);

  // 5. Read existing state
  const [{ data: existingRosterRaw }, { data: membersRaw }] = await Promise.all([
    service.from("chapter_roster").select("roll"),
    service.from("members").select("id, roll").not("roll", "is", null),
  ]);
  const existingRosterRolls = new Set((existingRosterRaw ?? []).map((r: { roll: number }) => r.roll));
  const membersRolls = new Set((membersRaw ?? []).map((m: { roll: number }) => m.roll));

  // 6. Compute diffs (no writes yet — same code path serves dry-run and real)
  const newRosterRows = valid.filter((r) => !existingRosterRolls.has(r.roll));
  const updatedRosterRows = valid.filter((r) => existingRosterRolls.has(r.roll));
  rosterAdded = newRosterRows.length;
  rosterUpdated = updatedRosterRows.length;
  // Members to create = new chapter_roster rows whose roll is NOT already in members
  const memberRollsToCreate = newRosterRows.filter((r) => !membersRolls.has(r.roll));

  if (dryRun) {
    for (const r of memberRollsToCreate) membersAdded.push({ roll: r.roll, name: r.name });
    return { rowsOnSheet: rows.length, rosterAdded, rosterUpdated, membersAdded, issues, durationMs: Date.now() - start, dryRun };
  }

  // 7. Batched chapter_roster upsert — chunks of 500 to stay under request-size limits.
  //    DEFERRABLE FK on big_brother_roll means same-batch self-refs resolve at commit.
  const CHUNK_SIZE = 500;
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE).map((r) => ({
      roll: r.roll,
      name: r.name,
      initiation_class: r.initiation_class,
      initiation_date: r.initiation_date,
      big_brother_roll: r.big_brother_roll,
      notes: r.notes,
    }));
    const { error } = await service.from("chapter_roster").upsert(chunk, { onConflict: "roll" });
    if (error) {
      issues.push({ roll: null, reason: `chapter_roster upsert (chunk @ ${i}) failed: ${error.message}` });
      // Hard fail — don't try to create members if roster didn't sync
      return { rowsOnSheet: rows.length, rosterAdded: 0, rosterUpdated: 0, membersAdded: [], issues, durationMs: Date.now() - start, dryRun };
    }
  }

  // 8. Create members for genuinely new rolls (typically 0-3 per sync — per-row is fine)
  for (const r of memberRollsToCreate) {
    const { error: memErr } = await service
      .from("members")
      .insert({ name: r.name, roll: r.roll, status: "active" });
    if (memErr) {
      issues.push({ roll: r.roll, reason: `members insert failed: ${memErr.message}` });
      continue;
    }
    membersAdded.push({ roll: r.roll, name: r.name });
    await service.from("audit_logs").insert({
      admin_email: "system",
      action: "Auto-Added Member from Master Sheet",
      details: `${r.name} (#${r.roll}) — added by master roster sync`,
    });
  }

  // 9. Summary audit log — only on genuinely new state (avoid noise: rosterUpdated
  //    is ~1386 on every sync because the batched upsert idempotently touches every row).
  if (rosterAdded > 0 || membersAdded.length > 0) {
    await service.from("audit_logs").insert({
      admin_email: "system",
      action: "Master Roster Sync",
      details: `${rosterAdded} new roster rows, ${rosterUpdated} touched, ${membersAdded.length} new members`,
    });
  }
  await service
    .from("settings")
    .upsert({ key: "last_roster_sync_at", value: new Date().toISOString(), updated_at: new Date().toISOString() });

  return {
    rowsOnSheet: rows.length,
    rosterAdded,
    rosterUpdated,
    membersAdded,
    issues,
    durationMs: Date.now() - start,
    dryRun,
  };
}
```

- [ ] **Step 5.2: TypeScript check**

```bash
npm run build
```

Expected: compiles cleanly. If you see "Cannot find module 'googleapis'" — it's a dep, should resolve. If you see type errors related to `SupabaseClient` generics, you may need `import type { SupabaseClient } from "@supabase/supabase-js"` (already in the snippet).

- [ ] **Step 5.3: Commit core function**

```bash
git add lib/sync-roster.ts scripts/sheet-preflight.ts
git commit -m "feat(roster): syncMasterRoster() — pure function + preflight script"
```

(Committing the preflight script too — useful for future debugging.)

---

## Task 6: API route

**Files:**
- Create: `app/api/admin/sync-roster/route.ts`

- [ ] **Step 6.1: Create the route**

```ts
import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { syncMasterRoster } from "@/lib/sync-roster";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const denied = await requireOwner();
  if (denied) return denied;

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const service = createServiceClient();

  try {
    const summary = await syncMasterRoster({ service, dryRun });
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await service.from("audit_logs").insert({
      admin_email: "system",
      action: "Master Roster Sync — FAILED",
      details: msg.slice(0, 500),
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 6.2: Build check**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 6.3: Dev-server manual test — unauthenticated**

```bash
npm run dev
```

In a logged-out incognito tab, run in the browser console (or use curl):
```js
fetch("/api/admin/sync-roster", { method: "POST" }).then(r => r.status)
```
Expected: `401` (intercepted by `proxy.ts`).

- [ ] **Step 6.4: Dev-server manual test — admin role**

Log in as an `admin`-role user. Same fetch.
Expected: `403` (rejected by `requireOwner()`).

- [ ] **Step 6.5: Dev-server manual test — owner role, dry-run**

Log in as `owner`. Run:
```js
fetch("/api/admin/sync-roster?dry=1", { method: "POST" }).then(r => r.json()).then(console.log)
```
Expected: JSON object with `dryRun: true`, `rowsOnSheet` ≈ 1387 (1 header + ~1386 data rows), `rosterAdded: 0`, `rosterUpdated: ~1386`, `membersAdded: []`, `issues: []`. Database is NOT modified — verify by checking `settings.last_roster_sync_at` in Supabase (should be unchanged or absent).

If `rosterUpdated` is much larger than expected, that's OK — it just means every row "would be" updated (idempotent upsert). What matters is `membersAdded: []` and `rosterAdded: 0`.

- [ ] **Step 6.6: Commit**

```bash
git add app/api/admin/sync-roster/route.ts
git commit -m "feat(api): POST /api/admin/sync-roster with dry-run support"
```

Stop the dev server (Ctrl+C).

---

## Task 7: Cron integration

**Files:**
- Modify: `app/api/cron/route.ts` (append at the very end, before `return NextResponse.json(...)`)

- [ ] **Step 7.1: Add sync call to cron**

Read the current end of `app/api/cron/route.ts` (around line 213-214):

```ts
  return NextResponse.json({ ok: true, escalated: overdue?.length ?? 0 });
}
```

Replace those two lines with:

```ts
  // --- Daily: Master roster sync ---
  let rosterSyncResult: { rosterAdded: number; rosterUpdated: number; membersAdded: number } | null = null;
  try {
    const result = await syncMasterRoster({ service, dryRun: false });
    rosterSyncResult = {
      rosterAdded: result.rosterAdded,
      rosterUpdated: result.rosterUpdated,
      membersAdded: result.membersAdded.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await service.from("audit_logs").insert({
      admin_email: "system",
      action: "Master Roster Sync — FAILED",
      details: msg.slice(0, 500),
    });
  }

  return NextResponse.json({ ok: true, escalated: overdue?.length ?? 0, rosterSync: rosterSyncResult });
}
```

- [ ] **Step 7.2: Add the import at the top of the file**

In `app/api/cron/route.ts`, after the existing imports (around line 3):

```ts
import { syncMasterRoster } from "@/lib/sync-roster";
```

- [ ] **Step 7.3: Build check**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 7.4: Manual cron test (local)**

Start dev server:
```bash
npm run dev
```

From a terminal, hit the cron route with the bearer token (read it from `.env.local`):
```bash
curl -X GET http://localhost:3000/api/cron \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Expected: `{"ok":true,"escalated":0,"rosterSync":{"rosterAdded":0,"rosterUpdated":<N>,"membersAdded":0}}`.

Verify `settings.last_roster_sync_at` updated in Supabase (Table Editor → settings).

- [ ] **Step 7.5: Commit**

```bash
git add app/api/cron/route.ts
git commit -m "feat(cron): nightly master roster sync"
```

Stop the dev server.

---

## Task 8: TransitionTab UI

Add a new card with "Master Roster Sync" — last-synced indicator + Dry-run + Run Now buttons + result modal.

**Files:**
- Modify: `app/admin/components/TransitionTab.tsx`

- [ ] **Step 8.1: Read the existing TransitionTab to find the insertion point**

Read `app/admin/components/TransitionTab.tsx` and locate the "Default Spreadsheet" card (it's the one with `defaultSheetId` state). The new card should go directly AFTER that card and BEFORE the term-export card. Note the JSX wrapper / className pattern used there so the new card matches the visual style.

- [ ] **Step 8.2: Add state hooks near the top of the component**

In `app/admin/components/TransitionTab.tsx`, in the state declarations block (around lines 23-42), add:

```tsx
const [lastRosterSyncAt, setLastRosterSyncAt] = useState<string | null>(null);
const [rosterSyncRunning, setRosterSyncRunning] = useState(false);
const [rosterSyncResult, setRosterSyncResult] = useState<{
  rowsOnSheet: number;
  rosterAdded: number;
  rosterUpdated: number;
  membersAdded: Array<{ roll: number; name: string }>;
  issues: Array<{ roll: number | null; reason: string }>;
  dryRun: boolean;
} | null>(null);
const [rosterSyncError, setRosterSyncError] = useState<string | null>(null);
```

- [ ] **Step 8.3: Extend `loadSettings()` to read `last_roster_sync_at`**

Find `loadSettings()` (around line 55) and add inside the `if (res.ok)` block, after the existing setters:

```tsx
setLastRosterSyncAt(data.last_roster_sync_at ?? null);
```

- [ ] **Step 8.4: Add the two click handlers**

After the existing `loadLeaderboard()` function and before any JSX returns, add:

```tsx
async function runRosterSync(dryRun: boolean) {
  setRosterSyncRunning(true);
  setRosterSyncError(null);
  setRosterSyncResult(null);
  try {
    const url = `/api/admin/sync-roster${dryRun ? "?dry=1" : ""}`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setRosterSyncError(data.error ?? `Sync failed (HTTP ${res.status})`);
    } else {
      setRosterSyncResult(data);
      // Re-load settings so the "last synced" timestamp updates after a real sync
      if (!dryRun) await loadSettings();
    }
  } catch (err) {
    setRosterSyncError(err instanceof Error ? err.message : String(err));
  } finally {
    setRosterSyncRunning(false);
  }
}
```

- [ ] **Step 8.5: Add the UI card and modal**

After the "Default Spreadsheet" card's closing `</div>`, add this new card. Match the existing className conventions (`adm-card`, `adm-card-title`, etc. — copy from the surrounding card, do NOT invent new ones):

```tsx
<div className="adm-card">
  <div className="adm-card-title">Master Roster Sync</div>
  <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
    Syncs the Master Roll Numbers Google Sheet → <code>chapter_roster</code> (upsert all) and{" "}
    <code>members</code> (insert new active members). Runs daily at 11:59 PM. Manual sync below.
  </div>
  <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
    Last synced:{" "}
    {lastRosterSyncAt
      ? `${new Date(lastRosterSyncAt).toLocaleString()} (${timeAgo(lastRosterSyncAt)})`
      : "never"}
  </div>
  <div style={{ display: "flex", gap: 8 }}>
    <button
      onClick={() => runRosterSync(true)}
      disabled={rosterSyncRunning}
      className="adm-btn-secondary"
    >
      {rosterSyncRunning ? "Working…" : "Dry-run preview"}
    </button>
    <button
      onClick={() => {
        if (confirm("Run roster sync now? This will create members for any new initiates on the master sheet.")) {
          runRosterSync(false);
        }
      }}
      disabled={rosterSyncRunning}
      className="adm-btn"
    >
      {rosterSyncRunning ? "Working…" : "Run Sync Now"}
    </button>
  </div>

  {rosterSyncError && (
    <div style={{ marginTop: 16, padding: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#F87171", fontSize: 13 }}>
      <strong>Sync failed:</strong> {rosterSyncError}
    </div>
  )}

  {rosterSyncResult && (
    <div style={{ marginTop: 16, padding: 12, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 6, fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: "#34D399", marginBottom: 8 }}>
        {rosterSyncResult.dryRun ? "Dry-run preview" : "Sync complete"}
      </div>
      <div>Rows on sheet: {rosterSyncResult.rowsOnSheet}</div>
      <div>{rosterSyncResult.dryRun ? "Would add" : "Added"} to chapter_roster: {rosterSyncResult.rosterAdded}</div>
      <div>{rosterSyncResult.dryRun ? "Would update" : "Updated"} in chapter_roster: {rosterSyncResult.rosterUpdated}</div>
      <div>
        {rosterSyncResult.dryRun ? "Would create" : "Created"} active members: {rosterSyncResult.membersAdded.length}
        {rosterSyncResult.membersAdded.length > 0 && (
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {rosterSyncResult.membersAdded.map((m) => (
              <li key={m.roll}>#{m.roll} {m.name}</li>
            ))}
          </ul>
        )}
      </div>
      {rosterSyncResult.issues.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong>Issues ({rosterSyncResult.issues.length}):</strong>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {rosterSyncResult.issues.slice(0, 20).map((iss, i) => (
              <li key={i}>{iss.roll ? `#${iss.roll}: ` : ""}{iss.reason}</li>
            ))}
          </ul>
          {rosterSyncResult.issues.length > 20 && <div>…and {rosterSyncResult.issues.length - 20} more</div>}
        </div>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 8.6: Add a `timeAgo` helper**

Above the component, after imports but before `export default function TransitionTab`, add:

```tsx
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
```

- [ ] **Step 8.7: Build check**

```bash
npm run build
```

Expected: clean. Most likely failure: an `adm-btn-secondary` class that doesn't exist. If so, look at admin.css for the actual button class names used by other secondary buttons in TransitionTab (e.g., `adm-btn-ghost`, `adm-btn-outline`) and use the right one. If unsure, just use `adm-btn` for both buttons.

- [ ] **Step 8.8: Manual UI test in dev server**

```bash
npm run dev
```

Navigate to `localhost:3000/admin` → Transition tab as `owner`.

Expected:
1. New "Master Roster Sync" card visible
2. "Last synced: never" (since this is fresh local DB) — or whatever was set during Task 7's cron test
3. Click "Dry-run preview" → spinner → result card appears showing rowsOnSheet ≈ 1387, rosterAdded 0, rosterUpdated ~1386, membersAdded 0, issues empty (or near-empty)
4. Refresh page → "Last synced" still shows the dry-run did NOT update it (correct — dry-run doesn't write `last_roster_sync_at`)

- [ ] **Step 8.9: Commit**

```bash
git add app/admin/components/TransitionTab.tsx
git commit -m "feat(admin): Master Roster Sync card in Transition tab"
```

Stop the dev server.

---

## Task 9: End-to-end live test

This is the moment of truth — actually create a new member via the master sheet.

- [ ] **Step 9.1: Add a real fake row to the master sheet**

Open the master Google Sheet. Find the next unused roll # (top of the sheet — the spreadsheet is roll-ordered with the most recent at top, per `import-chapter-roster.ts` ordering). Insert a new row at the top of the data rows with values like:

```
Roll: 1503  (or whatever is next)
Name: Test Sync User
Initiation Class: Pledge 2026
Initiation Date: 5/25/2026
Big Bro: <pick any current brother — e.g., "Jane Doe 1247">
Notes: <leave blank>
```

Save the sheet (Sheets auto-saves).

- [ ] **Step 9.2: Dry-run from Transition tab**

In the dev server (`npm run dev`), navigate to Transition tab → "Master Roster Sync" → click "Dry-run preview".

Expected:
- `rowsOnSheet`: 1388 (was 1387, +1 for the new row)
- `rosterAdded`: 1
- `rosterUpdated`: 1386
- `membersAdded`: 1 entry — `#1503 Test Sync User`
- `issues`: empty

If `rosterAdded` is 0 instead of 1, the new row's roll # was already in chapter_roster (you picked an existing #) — pick a higher unused #.

- [ ] **Step 9.3: Real sync**

Click "Run Sync Now" → confirm. Wait for the green success panel.

- [ ] **Step 9.4: Verify in Members tab**

Switch to the Members tab. Search/scroll for "Test Sync User".

Expected: present with status=active, roll #1503, and the big bro you picked.

- [ ] **Step 9.5: Verify audit log**

Switch to Audit tab.

Expected: two new entries near the top:
- `Auto-Added Member from Master Sheet` — `Test Sync User (#1503) — added by master roster sync`
- `Master Roster Sync` — `1 new roster rows, 1386 touched, 1 new members`

- [ ] **Step 9.6: Idempotence check**

Click "Run Sync Now" again immediately.

Expected: `rosterAdded: 0`, `membersAdded: 0`, `rosterUpdated: 1387`. No new audit log entries for "Auto-Added Member" — the summary log should NOT appear (the sync code only writes the summary when there are real changes).

- [ ] **Step 9.7: Name-doesn't-overwrite check (intentional non-behavior)**

Edit the test row in the sheet — change "Test Sync User" → "Test Sync RENAMED". Sync again.

Expected:
- `rosterUpdated`: 1387 (including the rename)
- `membersAdded`: 0 (we don't re-create)
- In Supabase, `chapter_roster.name` for #1503 is now "Test Sync RENAMED"
- In Supabase, `members.name` for roll=1503 is STILL "Test Sync User" (this is correct per spec — `members.name` is admin-controlled, not sheet-controlled)

- [ ] **Step 9.8: Cleanup**

In the Google Sheet: delete the test row.

In Supabase SQL Editor, run:
```sql
DELETE FROM members WHERE roll = 1503 AND name = 'Test Sync User';
DELETE FROM chapter_roster WHERE roll = 1503;
```

(Adjust the roll # / name if you used different values.)

Run sync once more. Verify rosterAdded=0, rosterUpdated=1386 (back to original count). No new entries created.

**No commit** — Task 9 is verification only.

---

## Task 10: Push to prod

- [ ] **Step 10.1: Review commit log**

```bash
git log --oneline origin/master..HEAD
```

Expected: 4 new commits — settings allowlist, sync function + preflight, API route, cron, UI. Plus the earlier spec commit `24e725a` if not pushed.

- [ ] **Step 10.2: Push**

```bash
git push origin master
```

This triggers a Vercel deploy.

- [ ] **Step 10.3: Watch the deploy**

Visit `vercel.com/<org>/<project>/deployments`. Wait for the new deploy to reach "Ready".

- [ ] **Step 10.4: Smoke-test production**

Navigate to `acaciajp.com/admin/` → Transition tab. Hard-refresh (Ctrl+Shift+R).

Expected:
- New "Master Roster Sync" card visible
- "Last synced: never" (since prod hasn't run cron yet against the new code)
- Click "Dry-run preview" — should succeed with rowsOnSheet ≈ 1387, rosterAdded=0, rosterUpdated=1386, membersAdded=0

If dry-run fails with "Sheets API: 403" — the share step from Task 2 didn't take. Recheck. If it fails with "Sheets API: 400 — Unable to parse range" — the tab name doesn't match. Recheck Task 3.4 capture.

- [ ] **Step 10.5: Trigger cron to populate `last_roster_sync_at` (optional)**

If you want the "Last synced" indicator populated immediately instead of waiting for 23:59 UTC, hit the cron URL with the bearer token from a terminal:

```bash
curl -X GET https://acaciajp.com/api/cron \
  -H "Authorization: Bearer <CRON_SECRET from Vercel env>"
```

Then reload Transition tab — "Last synced" should now show "just now".

---

## Spec Coverage Self-Check

| Spec section | Task implementing it |
|---|---|
| Sync algorithm steps 1-8 | Task 5 (entire `syncMasterRoster()`) |
| Daily cron @ 23:59 UTC | Task 7 |
| POST /api/admin/sync-roster | Task 6 |
| ?dry=1 query param | Task 6 step 6.5; Task 8 step 8.4 |
| Transition tab UI card | Task 8 |
| Last-synced indicator | Task 8 step 8.5; populated in Task 7 |
| Settings keys (3 new) | Task 4 (allowlist); written by Task 5 |
| Intentional non-behaviors (members.name not synced) | Task 5 step 5.1 (members INSERT only, never UPDATE); verified in Task 9.7 |
| Error handling (Sheets 403, bad headers, etc.) | Task 5 (issues[] collection); Task 6 (route try/catch); Task 7 (cron try/catch) |
| Operational config (service account, sheet share) | Tasks 1-2 |
| Manual test plan (spec §Testing Plan) | Task 9 |

Coverage complete.
