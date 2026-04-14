import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/service";

const FALLBACK_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
if (!FALLBACK_SPREADSHEET_ID) throw new Error("GOOGLE_SPREADSHEET_ID env var is not set");
const SHEET_NAME = "Fine Processing Form";

const MAX_NAME_LEN = 100;
const MAX_TYPE_LEN = 100;
const MAX_DESC_LEN = 500;
const MAX_DATE_LEN = 50;

export interface ExportFinePayload {
  member_name: string;
  fine_type: string;
  description?: string | null;
  amount: number | null;
  date_resolved?: string | null;
}

export async function exportFineToSheets(payload: ExportFinePayload): Promise<void> {
  const { member_name, fine_type, description, amount, date_resolved } = payload;

  const service = createServiceClient();
  const { data: sheetSetting } = await service.from("settings").select("value").eq("key", "google_spreadsheet_id").single();
  const spreadsheetId = sheetSetting?.value?.trim() || FALLBACK_SPREADSHEET_ID;

  const safeName = String(member_name).slice(0, MAX_NAME_LEN);
  const safeType = String(fine_type).slice(0, MAX_TYPE_LEN);
  const safeDesc = description != null ? String(description).slice(0, MAX_DESC_LEN) : "";
  const safeDate = date_resolved != null ? String(date_resolved).slice(0, MAX_DATE_LEN) : "";

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        new Date().toLocaleString("en-US"),
        safeName,
        safeDate,
        `${safeType} — ${safeDesc}`,
        `$${Number(amount ?? 0).toFixed(2)}`,
        "", // Column F: To Which Budget — filled in manually
      ]],
    },
  });
}
