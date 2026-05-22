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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type Row = {
  roll: number;
  name: string;
  initiation_class: string | null;
  initiation_date: string | null;
  big_brother_roll: number | null;
  notes: string | null;
};

type Issue = { roll: number; name: string; reason: string };

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
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Idempotent: clear all existing rows first (roll PK is always >= 1, so .gte(0) matches everything).
  console.log('Deleting existing chapter_roster rows...');
  const { error: delErr } = await supabase.from('chapter_roster').delete().gte('roll', 0);
  if (delErr) throw new Error(`Delete failed: ${delErr.message}`);

  // Insert in chunks of 500 to stay under Supabase request size limits.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    console.log(`Inserting rows ${i + 1}-${i + chunk.length} of ${rows.length}...`);
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

  await insertRows(valid);
  console.log(`\n✓ Inserted ${valid.length} rows into chapter_roster.`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
