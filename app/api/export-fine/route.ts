import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, exportLimiter } from "@/lib/rate-limit";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "17C4lp6_ZSaxi7bb58upLxrfUrtNuRKiiy_VpVWbuIQ0";
const SHEET_NAME = "Fine Processing Form";

// Max field lengths to prevent abuse
const MAX_NAME_LEN = 100;
const MAX_TYPE_LEN = 100;
const MAX_DESC_LEN = 500;
const MAX_DATE_LEN = 50;

export async function POST(req: NextRequest) {
  // Rate limit: 20 exports per minute per IP
  if (await isRateLimited(exportLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Auth: require a dedicated server-side secret, not the public anon key
  const authHeader = req.headers.get("authorization");
  const secret = process.env.EXPORT_API_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate and sanitize inputs
  const { member_name, fine_type, description, amount, date_resolved } = body;

  if (typeof member_name !== "string" || !member_name.trim()) {
    return NextResponse.json({ error: "member_name is required" }, { status: 400 });
  }
  if (typeof fine_type !== "string" || !fine_type.trim()) {
    return NextResponse.json({ error: "fine_type is required" }, { status: 400 });
  }
  if (amount == null || isNaN(Number(amount)) || Number(amount) < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  // Enforce length limits
  const safeName = String(member_name).slice(0, MAX_NAME_LEN);
  const safeType = String(fine_type).slice(0, MAX_TYPE_LEN);
  const safeDesc = description != null ? String(description).slice(0, MAX_DESC_LEN) : "";
  const safeDate = date_resolved != null ? String(date_resolved).slice(0, MAX_DATE_LEN) : "";

  try {
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
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          new Date().toLocaleString("en-US"),
          safeName,
          safeDate,
          `${safeType} — ${safeDesc}`,
          `$${Number(amount).toFixed(2)}`,
          "", // Column F: To Which Budget — filled in manually
        ]],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    // Log without exposing internal details to the client
    console.error("Google Sheets export error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
