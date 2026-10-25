import { getCurrentRole, requireAuth, requireOwner } from "@/lib/admin-auth";
import { HEARING_MINUTES_KEY, NEXT_SESSION_KEY, parseHearingMinutes, parseLearned, parseNextSession } from "@/lib/jp-info";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/settings — read all settings (any authenticated user)
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service.from("settings").select("key, value");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value ?? "";
  return NextResponse.json(map);
}

// PUT /api/admin/settings — update a single setting (owner only)
export async function PUT(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { key, value } = await req.json();
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  const ALLOWED_KEYS = [
    "venmo_handle",
    "venmo_url",
    "export_history",
    "google_spreadsheet_id",
    "game_enabled",
    "master_roster_spreadsheet_id",
    "master_roster_sheet_name",
    "last_roster_sync_at",
    NEXT_SESSION_KEY,
    HEARING_MINUTES_KEY,
  ];
  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
  }

  // These two are shown on the public homepage, so store only a normalized,
  // validated form — never whatever string the client sent.
  let stored: string = value;
  if (key === NEXT_SESSION_KEY) {
    if (value === "") {
      stored = "";
    } else {
      const parsed = parseNextSession(typeof value === "string" ? value : JSON.stringify(value));
      if (!parsed) return NextResponse.json({ error: "Next session needs a valid date" }, { status: 400 });
      stored = JSON.stringify(parsed);
    }
  } else if (key === HEARING_MINUTES_KEY) {
    // Keep what past sessions taught us; the admin form only edits the tier minutes.
    const { data: current } = await createServiceClient().from("settings").select("value").eq("key", HEARING_MINUTES_KEY).maybeSingle();
    const learned = parseLearned(current?.value);
    const tiers = parseHearingMinutes(typeof value === "string" ? value : JSON.stringify(value));
    stored = JSON.stringify(learned ? { ...tiers, learned } : tiers);
  }

  const service = createServiceClient();
  const { error } = await service
    .from("settings")
    .upsert({ key, value: stored, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (key === NEXT_SESSION_KEY || key === HEARING_MINUTES_KEY) {
    const current = await getCurrentRole();
    if (current) {
      await service.from(current.role === "root" ? "system_events" : "audit_logs").insert({
        admin_email: current.email,
        action: key === NEXT_SESSION_KEY ? "Updated Next JP Session" : "Updated Hearing Time Estimates",
        details: stored || "cleared",
      });
    }
  }

  return NextResponse.json({ success: true });
}
