import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const SPREADSHEET_ID = "17C4lp6_ZSaxi7bb58upLxrfUrtNuRKiiy_VpVWbuIQ0";
const SHEET_NAME = "Fine Processing Form";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { member_name, fine_type, description, amount, date_resolved } = body;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Columns: A=Timestamp, B=Member, C=Date Processed, D=Reason, E=Cost, F=Budget (manual)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-US"),
          member_name ?? "",
          date_resolved ?? "",
          `${fine_type ?? ""} — ${description ?? ""}`,
          amount != null ? `$${Number(amount).toFixed(2)}` : "",
          "", // Column F: To Which Budget — filled in manually
        ]],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Google Sheets export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
