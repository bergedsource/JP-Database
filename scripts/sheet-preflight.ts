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

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  console.log("\nTabs in this spreadsheet:");
  for (const s of meta.data.sheets ?? []) {
    console.log(`  - "${s.properties?.title}" (sheetId=${s.properties?.sheetId})`);
  }

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
