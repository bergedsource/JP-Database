# Master Roster Sync — Design

## Problem

The chapter maintains two parallel sources of truth for member identity:

1. The **Master Roll Numbers Google Sheet** — hand-edited by the JP Chair. Holds all 1,386 historical brothers and is updated when new initiates receive roll numbers.
2. The **`chapter_roster` table** in Supabase — populated by a one-shot CSV import script (`scripts/import-chapter-roster.ts`). Used by the trivia game and the Members tab's Big Brother autocomplete.
3. The **`members` table** — populated by the Add Member form in the admin UI. Holds currently active brothers + pledges who can be fined.

Today, when the JP Chair adds a new initiate to the master sheet, **nothing happens automatically**. They must:
1. Re-export the sheet to CSV
2. Re-run the import script with `--commit` (which is destructive — DELETEs all rows then re-INSERTs)
3. Separately open the Admin → Members tab and click "Add Member" to create the active-member record

This is fragile and easy to skip. Result: the Members tab and trivia game both drift from the master sheet.

## Goal

A daily background sync that reads the master sheet directly via the Google Sheets API and propagates changes into both `chapter_roster` and `members`:

- **chapter_roster**: upserted on every sync — name, big bro, init class, init date, notes all stay in sync with the sheet. (Reads use paginated `.range()` because Supabase silently caps single `.select()` calls at 1,000 rows.)
- **members**: new active-member rows auto-created ONLY when ALL THREE conditions hold:
  1. The roll # is brand new to `chapter_roster`
  2. The roll # is **strictly greater** than `max(chapter_roster.roll, members.roll)` — anything at-or-below is a retroactive backfill of a historical brother, not a new initiate
  3. The normalized name (lowercased, punctuation-stripped) does NOT match any existing `members.name` — catches the case where a current brother is already in the admin tool but had his roll # filled in late (or never)

  Existing member rows are left alone. Retroactive backfills update `chapter_roster` only — the JP Chair handles status manually if needed.

Plus a one-click "Sync Now" button + dry-run preview in the Transition tab so the JP Chair can force an immediate sync after editing the sheet without waiting for the next cron.

## Non-Goals

- **Bidirectional sync.** The sheet is the source of truth for roster identity; the app never writes back to the sheet.
- **Deletion mirroring.** A row removed from the sheet does NOT delete the matching `chapter_roster` row — accidental sheet deletions must not destroy history.
- **Member status changes.** Promotion to alumni / live-out / inactive remains 100% manual by the JP Chair. The sync never demotes.
- **`members.name` corrections.** The sync never overwrites an existing `members.name` — preserves hand-typed admin corrections.
- **Roll # corrections that change the PK.** Fixing a typo by changing a roll # on the sheet (e.g., 1499 → 1500) creates a new `chapter_roster` row at 1500 but leaves the old 1499 orphaned. True fix requires manual SQL — surfaced in audit log.
- **Sheet formatting as a signal.** "Highlighted in black = inactive" is a manual visual cue for the JP Chair; the sync code ignores all formatting.
- **Webhook-driven sync.** No Google Apps Script trigger — cron + manual button only.

## Approach

One shared sync function in `lib/sync-roster.ts`, called from three entry points:

```
                                     ┌─────────────────────────────┐
[Daily cron @ 23:59 UTC] ──────────► │                             │
                                     │   syncMasterRoster()        │
[POST /api/admin/sync-roster] ─────► │   lib/sync-roster.ts        │ ──► chapter_roster (upsert all sheet rows)
   (Transition tab button)           │                             │ ──► members (insert new-roll rows only)
                                     │   • reads Google Sheet      │ ──► audit_logs (one entry per write)
[POST /api/admin/sync-roster?dry=1]► │   • diffs vs existing roster│
   (Dry-run preview button)          │   • returns summary         │
                                     └─────────────────────────────┘
```

`syncMasterRoster()` is a pure function. Takes a Supabase service client + a Sheets API client + a `dryRun: boolean` flag. Returns:

```ts
{
  rowsOnSheet: number;
  rosterAdded: number;
  rosterUpdated: number;
  membersAdded: Array<{ roll: number; name: string }>;
  issues: Array<{ roll: number | null; reason: string }>;
  durationMs: number;
  dryRun: boolean;
}
```

No HTTP / cron coupling inside the function — both consumers (cron and the API route) wrap it.

## Sync Algorithm

```
1. Read settings:
   - master_roster_spreadsheet_id  (default: "10BRo_2eek0hVUFqqYmV2sgORPMe--KF1XKhaLm9DnbY")
   - master_roster_sheet_name      (default: "Sheet1")
   If spreadsheet_id is missing/blank → abort, audit-log the abort, return early.

2. Fetch sheet via Google Sheets API
   - sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1:F` })
   - Row 1 is headers. Match columns by header text (mirrors import-chapter-roster.ts):
       '#'                       → roll          (integer; skip row if missing or non-int)
       'Name:'                   → name          (required; skip row with issue if blank)
       'Initiation Class:'       → initiation_class (nullable)
       'Initiation Date:'        → initiation_date (M/D/YYYY → YYYY-MM-DD, nullable)
       'Big Bro:'                → big_brother_roll (parsed via regex /\s(\d+)\s*$/, nullable)
       'Venerable Dean / Other:' → notes         (nullable)
   - Header lookup is case-sensitive, exact match. Mismatched headers → abort with clear issue.

3. Validate parsed rows
   - Skip self-references (big_brother_roll === roll) and dangling FK refs (clear bb to null, log issue).
   - Mirror the logic in scripts/import-chapter-roster.ts exactly so behavior matches the bulk importer.

4. Read existing state from Supabase
   - existingRosterRolls: Set<number>   ← SELECT roll FROM chapter_roster
   - membersByRoll: Map<number, member_id>
       ← SELECT id, roll FROM members WHERE roll IS NOT NULL

5. For each parsed sheet row:
   a. If dryRun → only count what WOULD happen; skip writes.
   b. Otherwise, UPSERT into chapter_roster
        ON CONFLICT (roll) DO UPDATE SET name, initiation_class, initiation_date,
                                          big_brother_roll, notes
        (created_at preserved — only set on insert)
   c. If (roll NOT IN existingRosterRolls) AND (roll NOT IN membersByRoll):
        INSERT INTO members (name, roll, status) VALUES (sheetRow.name, roll, 'active')
        INSERT INTO audit_logs (admin_email='system', action='Auto-Added Member from Master Sheet',
                                details=`${name} (#${roll}) — added by master roster sync`)
        membersAdded.push({roll, name})

6. If any writes occurred, write a single summary audit log:
     action='Master Roster Sync'
     details=`${rosterAdded} new roster rows, ${rosterUpdated} updated, ${membersAdded.length} new members`

7. UPSERT settings.last_roster_sync_at = NOW()  (skip if dryRun)

8. Return summary object.
```

## Intentional Non-Behaviors (the things that explicitly DON'T happen)

| Scenario | What happens | Why |
|---|---|---|
| Row deleted from sheet | `chapter_roster` row stays | Prevents accidental sheet edits from wiping history |
| Existing `chapter_roster` row not on sheet | left alone | Same reason — additive, not mirror-copy |
| Member status change (active → alumni) | not synced — manual only | Per JP Chair's rule |
| `members.name` differs from sheet name | not auto-updated | Preserves hand-typed admin corrections |
| `members.status` for any reason | never touched by sync | Sync only ever INSERTs members; never UPDATEs |
| New row on sheet, roll # already in `members` | `chapter_roster` upserts, `members` create is SKIPPED | Prevents duplicate members for self-added rows |
| Big bro change on sheet | propagates via `chapter_roster` upsert | Members tab reads big bro from `chapter_roster`, so flows through automatically |
| Retroactive historical brother added to sheet (roll ≤ current max) | chapter_roster row created; members row NOT created | Sheet edits aren't allowed to retroactively re-classify alumni as active members |
| Roll # typo fix (e.g., 1499 → 1500 on sheet) | new roster row at 1500, old 1499 orphaned | True fix requires manual SQL — flagged as issue |
| Sheet has the same row twice (duplicate roll #) | last occurrence wins for upsert; one issue logged | Cheaper than two-pass dedup; sheet should not have duplicates |

## Settings Keys

The existing `settings` table (key/value store) gets three new entries. No migration needed.

| Key | Purpose | Default seeded on first deploy |
|---|---|---|
| `master_roster_spreadsheet_id` | The Google Sheet ID | `10BRo_2eek0hVUFqqYmV2sgORPMe--KF1XKhaLm9DnbY` |
| `master_roster_sheet_name` | Tab name inside that sheet | `Sheet1` |
| `last_roster_sync_at` | ISO timestamp of last successful sync | `null` until first run |

These are editable via the existing Transition-tab settings UI (allowed keys list in `/api/admin/settings`).

## Operational Configuration

- **Service account email**: `acacia-jp-sheets@jp-database-491921.iam.gserviceaccount.com`
- **Required Google share**: Master sheet shared with the service account email, role = **Viewer**
- **Sheets API scope**: `https://www.googleapis.com/auth/spreadsheets` (already authorized — same scope as the fines export)
- **Env vars used**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` — already set in Vercel
- **No new env vars or secrets required**

## API

### `POST /api/admin/sync-roster`

- Auth: `requireOwner()` (owner or root only)
- Rate limit: `adminLimiter` (60/min per IP)
- Query param: `?dry=1` → dry-run (no writes)
- Returns: the `syncMasterRoster()` summary object as JSON
- Errors:
  - 401 if not owner
  - 429 if rate-limited
  - 500 with `{error, issues}` body if Sheets API or DB writes fail

## Cron Integration

In `app/api/cron/route.ts`, append a new block at the end:

```ts
// --- Daily: Master roster sync ---
try {
  const result = await syncMasterRoster({ service, dryRun: false });
  if (result.rosterAdded > 0 || result.membersAdded.length > 0) {
    // (audit log already written by syncMasterRoster on writes)
  }
} catch (err) {
  await service.from("audit_logs").insert({
    admin_email: "system",
    action: "Master Roster Sync — FAILED",
    details: String(err instanceof Error ? err.message : err).slice(0, 500),
  });
  // Swallow — don't let sync failure abort the rest of the cron pass.
}
```

## UI — Transition Tab Addition

A new card titled **"Master Roster Sync"** placed under the existing budget sheet card. Owner/root only.

```
┌─ Master Roster Sync ─────────────────────────────────────────┐
│                                                              │
│ Source:  10BRo_2eek0hVUFqqYmV2sgORPMe... · Sheet1            │
│ Last synced:  2 hours ago · 3 new members added              │
│                                                              │
│ [ Dry-run preview ]     [ Run Sync Now ]                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- **Dry-run preview** button → POST `/api/admin/sync-roster?dry=1` → modal shows:
  - "Sheet has 1,389 rows"
  - "Would add 3 new roster entries"
  - "Would create 1 new active member: Jake Smith (#1502)"
  - "Would update 2 existing roster entries (big bro corrections)"
  - "Issues: (none)"
- **Run Sync Now** button → confirmation modal → POST `/api/admin/sync-roster` → toast on success with same stats, or red toast with error message
- Both buttons disabled if `master_roster_spreadsheet_id` is unset (with link/note: "Configure in Settings")

## Error Handling

| Failure mode | Behavior |
|---|---|
| `master_roster_spreadsheet_id` blank | Sync aborts with `issues: [{reason: 'spreadsheet_id not configured'}]`, audit log written |
| Sheets API auth failure (bad service account) | Caught in route handler, returns 500 + audit log; cron swallows and logs |
| Sheets API "permission denied" (sheet not shared) | Same — audit log says "Sheets API: 403 — share the sheet with the service account" |
| Sheet has unexpected header text | Sync aborts, returns issues listing missing headers; no writes |
| One row parse fails (bad date, missing name, etc.) | That row added to `issues[]`, sync continues for other rows |
| One `members` insert fails (e.g., DB hiccup) | Caught per-row, logged to `issues[]`, sync continues |
| `chapter_roster` bulk upsert fails entirely | Returns error; no members inserted; audit log captures failure |

## Testing Plan (manual)

Run in this order before declaring done:

1. **Local dev** — set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.env.local` (pulled from Vercel), share the master sheet with the service account, run `npm run dev`, navigate to Transition tab as owner.
2. **Dry-run before any writes** — click "Dry-run preview". Expected: sheet row count ≈ 1,386, roster add count = 0, member add count = 0 (assumes chapter_roster is already up-to-date from the original import). If any discrepancies appear, inspect before proceeding.
3. **Add a fake row to the sheet** at the next available roll # — e.g., `1502 / Test User / Pledge 2026 / 5/25/2026 / (some existing brother) 1247 / (blank)`.
4. **Dry-run again** — should show "+1 roster, +1 member, 0 updates, 0 issues".
5. **Run Sync Now** — verify success toast. Open Members tab → confirm "Test User" appears with roll 1502, status=active. Open trivia game admin → confirm big bro link works. Check `audit_logs` for two new entries (per-member + summary).
6. **Run sync again immediately** — should be a no-op: 0 added, 0 updated, 0 issues. Idempotent.
7. **Edit the sheet — change "Test User" name to "Test Renamed"** — sync again. Verify: `chapter_roster.name` updates to "Test Renamed", `members.name` STAYS "Test User" (intentional).
8. **Delete the fake row from the sheet** — sync. Verify: `chapter_roster` row at 1502 STAYS (additive sync). Manually DELETE from `chapter_roster` and `members` in Supabase to clean up.
9. **Cron path test** — trigger `GET /api/cron` with the bearer token from a local terminal. Verify sync block runs without aborting any earlier cron step.

## Out of Scope (future work, explicitly deferred)

- Webhook-driven sync (Google Apps Script `onEdit` → Vercel endpoint). Lower latency but adds a moving part.
- Two-way sync (admin UI edits push to sheet). Out of scope by design.
- Auto-handling of roll # corrections that change the PK (would require detecting a deleted-then-added roll # via name match).
- Bulk soft-delete: a "this row is alumni now" column on the sheet that auto-flips `members.status`. The JP Chair preferred manual control.
- Email notification when a new member is auto-added by the sync (could surface in the daily cron summary email).
- Replacing `scripts/import-chapter-roster.ts` entirely. Kept around for emergency bulk re-imports from CSV.

## Open Questions

(none — design is fully specified; implementation can start once user approves)
