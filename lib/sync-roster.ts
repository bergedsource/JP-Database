import { google, sheets_v4 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SPREADSHEET_ID = "10BRo_2eek0hVUFqqYmV2sgORPMe--KF1XKhaLm9DnbY";
const DEFAULT_SHEET_NAME = "Sheet1";

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

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchAllRosterRolls(service: SupabaseClient): Promise<number[]> {
  const PAGE = 1000;
  const all: number[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await service
      .from("chapter_roster")
      .select("roll")
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    for (const r of data as { roll: number }[]) all.push(r.roll);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
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
    if (!rollRaw) continue;
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

  const { spreadsheetId, sheetName } = await readSettings(service);
  if (!spreadsheetId) {
    issues.push({ roll: null, reason: "master_roster_spreadsheet_id is not configured" });
    return { rowsOnSheet: 0, rosterAdded: 0, rosterUpdated: 0, membersAdded: [], issues, durationMs: Date.now() - start, dryRun };
  }

  const sheets = buildSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:F`,
  });
  const rows = (res.data.values ?? []) as string[][];

  const { parsed, issues: parseIssues } = parseSheet(rows);
  issues.push(...parseIssues);
  if (parseIssues.some((i) => i.roll === null)) {
    return { rowsOnSheet: rows.length, rosterAdded: 0, rosterUpdated: 0, membersAdded: [], issues, durationMs: Date.now() - start, dryRun };
  }

  const { valid, issues: bbIssues } = validateBigBros(parsed);
  issues.push(...bbIssues);

  // chapter_roster is paginated — Supabase silently caps single .select() at 1000 rows,
  // and the table has >1000 rows. Members table is small enough to fetch in one go.
  const [rosterRolls, { data: membersRaw }] = await Promise.all([
    fetchAllRosterRolls(service),
    service.from("members").select("id, name, roll"),
  ]);
  const existingRosterRolls = new Set(rosterRolls);
  const membersWithRoll = (membersRaw ?? []).filter(
    (m: { roll: number | null }) => m.roll != null
  ) as { id: string; name: string; roll: number }[];
  const membersRolls = new Set(membersWithRoll.map((m) => m.roll));
  const existingMemberNames = new Set(
    (membersRaw ?? []).map((m: { name: string }) => normalizeName(m.name))
  );

  // Auto-create floor: a sheet row only becomes an active member if its roll # is
  // strictly greater than every roll # we already know about — across BOTH chapter_roster
  // AND members (since members may have rolls higher than chapter_roster's max). This
  // blocks retroactive backfills of historical brothers from being treated as new initiates.
  const maxRosterRoll = existingRosterRolls.size > 0 ? Math.max(...existingRosterRolls) : 0;
  const maxMemberRoll = membersRolls.size > 0 ? Math.max(...membersRolls) : 0;
  const maxExistingRoll = Math.max(maxRosterRoll, maxMemberRoll);

  const newRosterRows = valid.filter((r) => !existingRosterRolls.has(r.roll));
  const updatedRosterRows = valid.filter((r) => existingRosterRolls.has(r.roll));
  rosterAdded = newRosterRows.length;
  rosterUpdated = updatedRosterRows.length;
  // Members to create = (a) above the current max roll AND (b) not already in members
  // by roll # AND (c) not already in members by NAME (catches members whose roll # was
  // never filled in via the admin form).
  const memberRollsToCreate = newRosterRows.filter(
    (r) =>
      r.roll > maxExistingRoll &&
      !membersRolls.has(r.roll) &&
      !existingMemberNames.has(normalizeName(r.name))
  );

  if (dryRun) {
    for (const r of memberRollsToCreate) membersAdded.push({ roll: r.roll, name: r.name });
    return { rowsOnSheet: rows.length, rosterAdded, rosterUpdated, membersAdded, issues, durationMs: Date.now() - start, dryRun };
  }

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
      return { rowsOnSheet: rows.length, rosterAdded: 0, rosterUpdated: 0, membersAdded: [], issues, durationMs: Date.now() - start, dryRun };
    }
  }

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
