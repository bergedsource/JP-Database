import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";

const DEFAULTS = {
  venmo_handle: "@Dillon-Berge",
  venmo_url: "https://venmo.com/Dillon-Berge",
  game_enabled: "false",
};

// GET /api/settings — public venmo info for the public-facing page
export async function GET(req: Request) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    // Reads the curated `public_settings` view (see migration_public_read_views
    // .sql), which exposes only these three keys at the DB layer — no other
    // settings row is reachable through this route.
    const service = createServiceClient();
    const { data } = await service
      .from("public_settings")
      .select("key, value")
      .in("key", ["venmo_handle", "venmo_url", "game_enabled"]);

    const map: Record<string, string> = { ...DEFAULTS };
    for (const row of data ?? []) map[row.key] = row.value ?? map[row.key];
    return NextResponse.json(map, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(DEFAULTS, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  }
}
