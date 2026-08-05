import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Reads the curated `public_members` view (see migration_public_read_views.sql):
  // the view exposes only safe columns for active+pledge rows, so this route
  // cannot over-read even if the select is later widened. anon still has no DB
  // access, so this stays rate-limited (unlike direct PostgREST).
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("public_members")
    .select("id, name, status, roll")
    .order("name");

  if (error) return NextResponse.json([], { status: 500 });

  return NextResponse.json(data ?? [], {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
