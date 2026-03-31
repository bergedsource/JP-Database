import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const SPREADSHEET_ID = "17C4lp6_ZSaxi7bb58upLxrfUrtNuRKiiy_VpVWbuIQ0";
const SHEET_GID = "1414988078";

async function getSheetName(): Promise<string> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets?.find(
    (s) => String(s.properties?.sheetId) === SHEET_GID
  );
  return sheet?.properties?.title ?? "Sheet1";
}

export async function POST(req: NextRequest) {
  try {
    // Verify the request is from an authenticated admin via a simple shared secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { member_name, fine_type, description, amount, term, date_issued, date_resolved, notes } = body;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const sheetName = await getSheetName();

    // Check if headers exist, add them if not
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:H1`,
    });

    if (!existing.data.values || existing.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Member", "Fine Type", "Description", "Amount", "Term", "Date Issued", "Date Paid", "Notes"]],
        },
      });
    }

    // Append the paid fine row
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:H`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          member_name ?? "",
          fine_type ?? "",
          description ?? "",
          amount != null ? `$${Number(amount).toFixed(2)}` : "",
          term ?? "",
          date_issued ?? "",
          date_resolved ?? "",
          notes ?? "",
        ]],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Google Sheets export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
