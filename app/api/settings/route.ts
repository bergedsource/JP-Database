import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { publicSettings } from "@/lib/public-data";

// GET /api/settings — public venmo info for the public-facing page. Reads the
// curated `public_settings` view (see migration_public_read_views.sql), which
// exposes only these keys at the DB layer.
export async function GET(req: Request) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  return NextResponse.json(await publicSettings(createServiceClient()), {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
