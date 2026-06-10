import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  // Service client: `members` is no longer anon-readable via RLS
  // (see migration_harden_rls_security.sql). Public but rate-limited; returns
  // only id/name/status/roll for active+pledge members, capped at 8 rows.
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, name, status, roll")
    .ilike("name", `%${q}%`)
    .in("status", ["active", "pledge"])
    .order("name")
    .limit(8);

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data ?? []);
}
