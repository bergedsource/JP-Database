import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";

const DEFAULTS = {
  venmo_handle: "@Dillon-Berge",
  venmo_url: "https://venmo.com/Dillon-Berge",
};

// GET /api/settings — public venmo info for the public-facing page
export async function GET(req: Request) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const service = createServiceClient();
    const { data } = await service
      .from("settings")
      .select("key, value")
      .in("key", ["venmo_handle", "venmo_url"]);

    const map: Record<string, string> = { ...DEFAULTS };
    for (const row of data ?? []) map[row.key] = row.value ?? map[row.key];
    return NextResponse.json(map);
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}
