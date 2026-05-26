import { createServiceClient } from "@/lib/supabase/service";
import { Redis } from "@upstash/redis";
import { google } from "googleapis";
import { NextResponse } from "next/server";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const SHEET_SHARED_CACHE_KEY = "master-sheet-shared";
// 60s: short enough that locking the sheet down takes effect quickly,
// long enough to avoid hammering the Drive API on every /start call.
const SHEET_SHARED_CACHE_TTL_SEC = 60;
const DEFAULT_SPREADSHEET_ID = "10BRo_2eek0hVUFqqYmV2sgORPMe--KF1XKhaLm9DnbY";

// Mirrors the requireOwner() pattern: returns a 403 NextResponse when the kill switch is off,
// or null when the game is enabled. Callers do `const denied = await gameDisabledResponse(); if (denied) return denied;`
export async function gameDisabledResponse(): Promise<NextResponse | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("settings")
    .select("value")
    .eq("key", "game_enabled")
    .maybeSingle();
  if (data?.value !== "true") {
    return NextResponse.json({ error: "Game is not currently enabled" }, { status: 403 });
  }
  return null;
}

async function getSpreadsheetId(): Promise<string> {
  const service = createServiceClient();
  const { data } = await service
    .from("settings")
    .select("value")
    .eq("key", "master_roster_spreadsheet_id")
    .maybeSingle();
  const v = (data?.value ?? "").trim();
  return v || DEFAULT_SPREADSHEET_ID;
}

async function checkSheetShared(spreadsheetId: string): Promise<boolean> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.permissions.list({
    fileId: spreadsheetId,
    fields: "permissions(type,role)",
  });
  const permissions = res.data.permissions ?? [];
  // "anyone" = link-sharing on; "domain" = shared with a whole Google Workspace domain.
  // Either means a brother could open the sheet during the game to cheat.
  return permissions.some((p) => p.type === "anyone" || p.type === "domain");
}

// Returns a 503 NextResponse when the master roster sheet is publicly accessible
// (link-shared or domain-shared), or null when locked down. Falls open on Drive
// API errors so transient Google outages don't permanently block the game.
export async function sheetSharedResponse(): Promise<NextResponse | null> {
  const cached = await redis.get<string>(SHEET_SHARED_CACHE_KEY);
  if (cached === "1") {
    return NextResponse.json(
      { error: "Game paused: roster sheet is currently shared. Try again later." },
      { status: 503 },
    );
  }
  if (cached === "0") return null;

  let shared = false;
  try {
    const spreadsheetId = await getSpreadsheetId();
    shared = await checkSheetShared(spreadsheetId);
  } catch (err) {
    console.error("[game-gate] Drive permissions check failed (failing open):", err);
    return null;
  }

  await redis.set(SHEET_SHARED_CACHE_KEY, shared ? "1" : "0", { ex: SHEET_SHARED_CACHE_TTL_SEC });

  if (shared) {
    return NextResponse.json(
      { error: "Game paused: roster sheet is currently shared. Try again later." },
      { status: 503 },
    );
  }
  return null;
}
