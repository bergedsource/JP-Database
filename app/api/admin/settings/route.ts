import { requireAuth, requireOwner } from "@/lib/admin-auth";
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

  const ALLOWED_KEYS = ["venmo_handle", "venmo_url", "export_history"];
  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
