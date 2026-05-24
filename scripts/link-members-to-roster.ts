// Links active/pledge members to their chapter_roster roll numbers using the CSV.
//
// Usage:
//   npx tsx scripts/link-members-to-roster.ts              # dry-run: show matches
//   npx tsx scripts/link-members-to-roster.ts --commit     # write rolls to members table
//
// Match strategy (in order):
//   1. Exact case-insensitive name match
//   2. First + last name only (ignores middle name in CSV)

import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const CSV_PATH = "scripts/data/roster.csv";
const COMMIT = process.argv.includes("--commit");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// ── Parse CSV ────────────────────────────────────────────────────────────────

const text = readFileSync(CSV_PATH, "utf8");
const records: Record<string, string>[] = parse(text, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

type CsvRow = { roll: number; name: string };
const csvByExact = new Map<string, CsvRow>();   // "john allister mcdonald" → row
const csvByFirstLast = new Map<string, CsvRow>(); // "john mcdonald" → row (first + last only)

for (const rec of records) {
  const roll = parseInt(rec["#"], 10);
  const name = rec["Name:"]?.trim();
  if (!name || !Number.isFinite(roll)) continue;

  const lower = name.toLowerCase();
  csvByExact.set(lower, { roll, name });

  const parts = lower.split(/\s+/);
  if (parts.length >= 2) {
    const key = `${parts[0]} ${parts[parts.length - 1]}`;
    // Only store first occurrence to avoid collisions on common name pairs
    if (!csvByFirstLast.has(key)) csvByFirstLast.set(key, { roll, name });
  }
}

console.log(`CSV loaded: ${csvByExact.size} roster entries`);

// ── Main ─────────────────────────────────────────────────────────────────────

type Update = { id: string; memberName: string; roll: number; csvName: string; matchType: string };

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: members, error } = await supabase
    .from("members")
    .select("id, name, roll, status")
    .in("status", ["active", "pledge"])
    .order("name");

  if (error || !members) {
    console.error("Failed to fetch members:", error?.message);
    process.exit(1);
  }

  console.log(`DB members (active/pledge): ${members.length}\n`);
  console.log("=".repeat(70));

  const updates: Update[] = [];
  const skipped: string[] = [];
  const unmatched: string[] = [];

  for (const m of members) {
    if (m.roll != null) {
      skipped.push(`${m.name} (already #${m.roll})`);
      continue;
    }

    const lower = m.name.toLowerCase().trim();

    // Strategy 1: exact match
    let match = csvByExact.get(lower);
    let matchType = "exact";

    // Strategy 2: first + last only
    if (!match) {
      const parts = lower.split(/\s+/);
      if (parts.length >= 2) {
        const key = `${parts[0]} ${parts[parts.length - 1]}`;
        match = csvByFirstLast.get(key);
        matchType = "first+last";
      }
    }

    if (match) {
      console.log(`  MATCH  [${matchType.padEnd(10)}] "${m.name}" → roll #${match.roll}  (CSV: "${match.name}")`);
      updates.push({ id: m.id, memberName: m.name, roll: match.roll, csvName: match.name, matchType });
    } else {
      console.log(`  NO MATCH                  "${m.name}"`);
      unmatched.push(m.name);
    }
  }

  console.log("=".repeat(70));
  console.log(`\nSummary:`);
  console.log(`  Already have rolls : ${skipped.length}`);
  console.log(`  Will update        : ${updates.length}`);
  console.log(`  No match found     : ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log(`\nUnmatched members (need manual roll entry in admin):`);
    for (const n of unmatched) console.log(`    • ${n}`);
  }

  if (!COMMIT) {
    console.log("\nDry run — pass --commit to apply updates.");
    return;
  }

  // Apply updates
  console.log("\nApplying updates...");
  let ok = 0;
  let fail = 0;

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from("members")
      .update({ roll: u.roll })
      .eq("id", u.id);

    if (upErr) {
      console.error(`  FAILED  "${u.memberName}": ${upErr.message}`);
      fail++;
    } else {
      console.log(`  UPDATED "${u.memberName}" → roll #${u.roll}`);
      ok++;
    }
  }

  console.log(`\nDone. ${ok} updated, ${fail} failed.`);
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
