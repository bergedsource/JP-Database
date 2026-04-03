import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "17C4lp6_ZSaxi7bb58upLxrfUrtNuRKiiy_VpVWbuIQ0";

// Extract §XX-XXX from fine_type e.g. "Missing Chapter Meeting (§11-100)" → "§11-100"
function extractBylaw(fineType: string): string {
  const match = fineType.match(/\((§[\d-]+)\)/);
  return match ? match[1] : "";
}

// POST /api/admin/bulk-export — export all fines for a term to Google Sheets
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { term, spreadsheetId: customId } = await req.json();
  if (!term || typeof term !== "string") {
    return NextResponse.json({ error: "term is required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Fetch all fines for the term, join member name + roll
  const { data: fines, error } = await service
    .from("fines")
    .select("fine_type, description, amount, status, date_issued, notes, fining_officer, members(name, roll)")
    .eq("term", term)
    .order("date_issued", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!fines || fines.length === 0) {
    return NextResponse.json({ error: "No fines found for this term" }, { status: 404 });
  }

  const HEADERS = ["Who?", "Roll #", "Why", "Amount", "Fining Officer", "Passed?", "Fining Date", "Budget", "Relevant Bylaw", "Notes", "Minutes", "Paid?"];

  const rows = (fines as unknown as {
    fine_type: string;
    description: string;
    amount: number | null;
    status: string;
    date_issued: string;
    notes: string | null;
    fining_officer: string | null;
    members: { name: string; roll: number | null } | null;
  }[]).map((f) => [
    f.members?.name ?? "",
    f.members?.roll ?? "",
    `${f.fine_type} — ${f.description}`,
    f.amount != null ? `$${Number(f.amount).toFixed(2)}` : "",
    f.fining_officer ?? "",
    ["upheld", "paid", "labor"].includes(f.status) ? "TRUE" : "FALSE",
    new Date(f.date_issued).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    "", // Budget — manual
    extractBylaw(f.fine_type),
    f.notes ?? "",
    "", // Minutes — manual
    ["paid", "labor"].includes(f.status) ? "TRUE" : "FALSE",
  ]);

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const tabName = `${term} Fines`;
    const spreadsheetId = (typeof customId === "string" && customId.trim()) ? customId.trim() : SPREADSHEET_ID;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    let sheetId: number = 0;

    {
      // Check if tab already exists
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const existing = spreadsheet.data.sheets?.find((s) => s.properties?.title === tabName);

      if (existing) {
        sheetId = existing.properties!.sheetId!;
        await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tabName}'!A:L` });
      } else {
        const addRes = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
        });
        sheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
      }
    }

    // Write headers + data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS, ...rows] },
    });

    // Apply checkbox formatting to columns F (index 5) and L (index 11)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            setDataValidation: {
              range: { sheetId, startRowIndex: 1, endRowIndex: rows.length + 1, startColumnIndex: 5, endColumnIndex: 6 },
              rule: { condition: { type: "BOOLEAN" }, strict: true, showCustomUi: true },
            },
          },
          {
            setDataValidation: {
              range: { sheetId, startRowIndex: 1, endRowIndex: rows.length + 1, startColumnIndex: 11, endColumnIndex: 12 },
              rule: { condition: { type: "BOOLEAN" }, strict: true, showCustomUi: true },
            },
          },
        ],
      },
    });

    return NextResponse.json({ success: true, count: rows.length, tab: tabName, url: spreadsheetUrl, isCustom: !!customId });
  } catch (err) {
    console.error("Bulk export error:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
