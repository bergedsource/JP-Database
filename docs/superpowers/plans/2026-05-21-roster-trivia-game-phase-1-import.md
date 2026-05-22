# Chapter Trivia Game — Phase 1: Schema + Roster Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `chapter_roster` Supabase table and import all ~1390 entries from Dillon's Master Roll Numbers spreadsheet, with a re-runnable script that handles known data anomalies (self-references, broken FKs, empty rows) by inserting partial data and logging issues.

**Architecture:** One Supabase migration adds a self-referential `chapter_roster` table. A standalone Node script (`scripts/import-chapter-roster.ts`) parses a CSV exported from Google Sheets, validates each row, prints a dry-run summary, and inserts only when run with `--commit`. CSV is used instead of the original PDF because pdf-parse output is unpredictable for tabular data with multi-word fields.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Node.js (`tsx`), `csv-parse`, `@supabase/supabase-js` service client.

**Spec reference:** `docs/superpowers/specs/2026-05-21-roster-trivia-game-design.md` — "Database" and "One-Time PDF Import" sections.

---

## Files Created / Modified

| File | Purpose |
|---|---|
| `supabase/migrations/migration_add_chapter_roster.sql` | New table DDL |
| `lib/types.ts` | Append `ChapterRosterEntry` type |
| `scripts/import-chapter-roster.ts` | One-shot importer (kept for re-runs after data corrections) |
| `scripts/data/roster.csv` | Source data (gitignored after first import — not committed) |
| `package.json` / `package-lock.json` | Add `csv-parse` and `tsx` dev dep |
| `.gitignore` | Add `scripts/data/` |

---

### Task 1: Create the `chapter_roster` migration SQL

**Files:**
- Create: `supabase/migrations/migration_add_chapter_roster.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Stores the full historical chapter roster (~1390 entries) for the trivia game.
-- big_brother_roll is a self-FK; deferrable so the bulk insert can populate
-- rows in any order before referential integrity is checked.

CREATE TABLE chapter_roster (
  roll              INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  initiation_class  TEXT,
  initiation_date   DATE,
  big_brother_roll  INTEGER REFERENCES chapter_roster(roll)
                      ON DELETE SET NULL
                      DEFERRABLE INITIALLY DEFERRED,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chapter_roster_big_brother ON chapter_roster(big_brother_roll);
CREATE INDEX idx_chapter_roster_name_lower ON chapter_roster(LOWER(name));
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/migration_add_chapter_roster.sql
git commit -m "feat(db): add chapter_roster table migration"
```

- [ ] **Step 3: Run the migration in Supabase**

Manual step (Dillon runs this in the Supabase SQL Editor, NOT the agent):
1. Open https://supabase.com/dashboard → SQL Editor
2. Paste contents of `migration_add_chapter_roster.sql`
3. Click Run
4. Verify with:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'chapter_roster' ORDER BY ordinal_position;
```

Expected: 7 columns — roll (integer), name (text), initiation_class (text), initiation_date (date), big_brother_roll (integer), notes (text), created_at (timestamp with time zone).

---

### Task 2: Add the `ChapterRosterEntry` TypeScript type

**Files:**
- Modify: `lib/types.ts` — append at end of file

- [ ] **Step 1: Append the type**

Add to the end of `lib/types.ts`:

```ts
export interface ChapterRosterEntry {
  roll: number;
  name: string;
  initiation_class: string | null;
  initiation_date: string | null;
  big_brother_roll: number | null;
  notes: string | null;
  created_at?: string;
}
```

- [ ] **Step 2: Verify the build still passes**

```bash
npm run build
```

Expected: build succeeds. No new TypeScript errors (existing pre-existing lint warnings are fine).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add ChapterRosterEntry"
```

---

### Task 3: Install CSV parser + tsx runner

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install csv-parse
npm install --save-dev tsx
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('csv-parse/sync')"
```

Expected: no output, no error. Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add csv-parse + tsx for roster import"
```

---

### Task 4: Gitignore the data folder

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add the entry**

Append to `.gitignore`:

```
# Roster CSV — sourced from the master spreadsheet, not version-controlled
scripts/data/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore scripts/data/ (local-only roster source)"
```

---

### Task 5: Dillon exports the spreadsheet to CSV

**Files:**
- Create: `scripts/data/roster.csv` (local-only, gitignored)

Manual step (Dillon, NOT the agent):

1. Open the Google Sheets master spreadsheet
2. File → Download → Comma-separated values (.csv)
3. Move the downloaded file to `C:\Users\Dillon\berged-source\scripts\data\roster.csv` (create the `scripts/data/` directory if it doesn't exist)
4. Open the CSV in a text editor (Notepad / VS Code) and confirm the header row reads exactly:

```
#,Name:,Initiation Class:,Initiation Date:,Big Bro:,Venerable Dean / Other:
```

If the header text differs, note the exact column names — Task 6's parser keys off them.

- [ ] **Step 1: Verify the file exists at the expected path**

```bash
ls scripts/data/roster.csv
```

Expected: file is listed. Size should be roughly 80–150 KB for ~1390 rows.

---

### Task 6: Write the import script

**Files:**
- Create: `scripts/import-chapter-roster.ts`

- [ ] **Step 1: Write the full script**

```ts
// Roster importer for the chapter trivia game.
//
// Usage:
//   npx tsx scripts/import-chapter-roster.ts              # dry-run: parse, validate, print summary
//   npx tsx scripts/import-chapter-roster.ts --commit     # actually insert into chapter_roster
//
// Reads scripts/data/roster.csv. Reads Supabase URL + service role key from .env.local.
// Idempotent: each run with --commit DELETEs all chapter_roster rows first, then re-inserts.

import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const CSV_PATH = 'scripts/data/roster.csv';
const COMMIT = process.argv.includes('--commit');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Row = {
  roll: number;
  name: string;
  initiation_class: string | null;
  initiation_date: string | null;
  big_brother_roll: number | null;
  notes: string | null;
};

type Issue = { roll: number | null; name: string; reason: string };

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // CSV exports M/D/YYYY (e.g. "4/19/1924"). Convert to YYYY-MM-DD for Postgres.
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function parseBigBroRoll(raw: string | undefined): number | null {
  if (!raw) return null;
  // Spreadsheet format: "Nikolas Vidmantas 1290" — extract trailing integer.
  const m = raw.trim().match(/\s(\d+)\s*$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function parseCsv(): { rows: Row[]; parseIssues: Issue[] } {
  const text = readFileSync(CSV_PATH, 'utf8');
  const records: Record<string, string>[] = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const rows: Row[] = [];
  const parseIssues: Issue[] = [];

  for (const r of records) {
    const rollRaw = r['#'];
    const name = r['Name:'];
    if (!rollRaw || !rollRaw.trim()) continue;        // blank padding rows
    const roll = parseInt(rollRaw.trim(), 10);
    if (!Number.isInteger(roll)) continue;
    if (!name || !name.trim()) {
      parseIssues.push({ roll, name: '(empty)', reason: 'missing name' });
      continue;
    }
    rows.push({
      roll,
      name: name.trim(),
      initiation_class: (r['Initiation Class:'] || '').trim() || null,
      initiation_date: parseDate(r['Initiation Date:']),
      big_brother_roll: parseBigBroRoll(r['Big Bro:']),
      notes: (r['Venerable Dean / Other:'] || '').trim() || null,
    });
  }

  return { rows, parseIssues };
}

function validateBigBros(rows: Row[]): { valid: Row[]; brokenLinks: Issue[] } {
  const rollSet = new Set(rows.map((r) => r.roll));
  const valid: Row[] = [];
  const brokenLinks: Issue[] = [];

  for (const r of rows) {
    if (r.big_brother_roll == null) {
      valid.push(r);
      continue;
    }
    if (r.big_brother_roll === r.roll) {
      brokenLinks.push({ roll: r.roll, name: r.name, reason: `self-reference (bb=${r.big_brother_roll})` });
      valid.push({ ...r, big_brother_roll: null });
      continue;
    }
    if (!rollSet.has(r.big_brother_roll)) {
      brokenLinks.push({ roll: r.roll, name: r.name, reason: `big_brother_roll ${r.big_brother_roll} not found in roster` });
      valid.push({ ...r, big_brother_roll: null });
      continue;
    }
    valid.push(r);
  }

  return { valid, brokenLinks };
}

async function insertRows(rows: Row[]): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Idempotent: clear existing rows first.
  console.log('Deleting existing chapter_roster rows...');
  const { error: delErr } = await supabase.from('chapter_roster').delete().gte('roll', 0);
  if (delErr) throw new Error(`Delete failed: ${delErr.message}`);

  // Insert in chunks of 500 to stay under Supabase request size limits.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    console.log(`Inserting rows ${i + 1}–${i + chunk.length} of ${rows.length}...`);
    const { error } = await supabase.from('chapter_roster').insert(chunk);
    if (error) throw new Error(`Insert failed at chunk starting ${i}: ${error.message}`);
  }
}

async function main() {
  console.log(`Reading ${CSV_PATH}\n`);
  const { rows, parseIssues } = parseCsv();
  console.log(`Parsed ${rows.length} valid rows`);
  if (parseIssues.length) {
    console.log(`\nParse issues (${parseIssues.length}):`);
    for (const i of parseIssues) console.log(`  #${i.roll} ${i.name}: ${i.reason}`);
  }

  const { valid, brokenLinks } = validateBigBros(rows);
  const withBigBro = valid.filter((r) => r.big_brother_roll != null).length;
  console.log(`\nReady to insert: ${valid.length} rows (${withBigBro} with big bro link)`);

  if (brokenLinks.length) {
    console.log(`\nBig bro links cleared due to issues (${brokenLinks.length}):`);
    for (const i of brokenLinks) console.log(`  #${i.roll} ${i.name}: ${i.reason}`);
  }

  if (!COMMIT) {
    console.log('\n[DRY RUN] Pass --commit to actually write to the database.');
    return;
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  }

  await insertRows(valid);
  console.log(`\n✓ Inserted ${valid.length} rows into chapter_roster.`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/import-chapter-roster.ts
git commit -m "feat(import): add chapter roster CSV importer (dry-run default)"
```

---

### Task 7: Dry-run the importer and review output

**Files:** none modified.

- [ ] **Step 1: Run in dry-run mode**

```bash
npx tsx scripts/import-chapter-roster.ts
```

Expected output structure:
```
Reading scripts/data/roster.csv

Parsed NNNN valid rows

Ready to insert: NNNN rows (MMM with big bro link)

Big bro links cleared due to issues (K):
  #1147 Thomas Edwin Moore IV: big_brother_roll 133 not found in roster
  #1180 Willy (Pui) Hang Wong: big_brother_roll 1 not found in roster
  #1182 Keven Enrique Estupinian: self-reference (bb=1182)
  ...

[DRY RUN] Pass --commit to actually write to the database.
```

- [ ] **Step 2: Sanity check the numbers**

Expected approximations from spec review:
- ~1390 valid rows
- ~400+ with big bro link
- ~5–10 broken big-bro links (the known issues from the spec)

If the row count is wildly off (e.g., <500 or >2000), STOP and investigate the CSV header / column names before proceeding.

---

### Task 8: Run the actual import

**Files:** writes to Supabase `chapter_roster` table only.

- [ ] **Step 1: Confirm the migration was run in Task 1 Step 3**

```bash
# Quick check that the table exists by attempting a no-op SELECT
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
c.from('chapter_roster').select('roll').limit(1).then(({error, data}) => {
  console.log(error ? 'ERROR: ' + error.message : 'OK, rows: ' + (data?.length ?? 0));
});
"
```

Expected: "OK, rows: 0" (or some count if you've run before). If "ERROR: relation \"chapter_roster\" does not exist" — go back and run Task 1 Step 3 first.

- [ ] **Step 2: Run the importer with --commit**

```bash
npx tsx scripts/import-chapter-roster.ts --commit
```

Expected ending: `✓ Inserted NNNN rows into chapter_roster.`

- [ ] **Step 3: Verify in Supabase**

In the Supabase SQL Editor, run:

```sql
SELECT COUNT(*) AS total,
       COUNT(big_brother_roll) AS with_big_bro
FROM chapter_roster;
```

Expected: `total` matches the dry-run count, `with_big_bro` ≈ 400+.

Spot-check one known row (Dillon, roll 1352):

```sql
SELECT cr.roll, cr.name, cr.big_brother_roll, bb.name AS big_brother_name
FROM chapter_roster cr
LEFT JOIN chapter_roster bb ON bb.roll = cr.big_brother_roll
WHERE cr.roll = 1352;
```

Expected: `roll=1352, name='Dillon "PD1" Berge', big_brother_roll=1290, big_brother_name='Nikolas Vidmantas'`.

---

### Task 9: Final commit and cleanup

**Files:** none — verification only.

- [ ] **Step 1: Confirm no uncommitted changes**

```bash
git status
```

Expected: "nothing to commit, working tree clean".

- [ ] **Step 2: Push to origin**

```bash
git push origin master
```

This triggers a Vercel deploy of the new types + migration file + import script. The script doesn't run automatically — it's a manual tool. The deploy only updates the type definitions and adds files to the repo; no runtime behavior changes for the live site.

---

## Done When

- `chapter_roster` table exists in production Supabase with ~1390 rows
- Spot-check query for roll 1352 returns Dillon's data with Nikolas Vidmantas linked
- `scripts/import-chapter-roster.ts` is committed and can be re-run for data corrections
- Vercel build of master is green
- No changes visible to public users — this phase is data-only

## Out of Scope (Phase 2+)

- Admin form Big Brother autocomplete (Phase 2)
- Game UI, leaderboard table, public APIs (Phase 3)
- "Clear leaderboard" admin button (Phase 4)
