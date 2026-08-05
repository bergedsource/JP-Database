import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  // Reads the curated `public_members` view (see migration_public_read_views.sql),
  // which restricts to id/name/status/roll for active+pledge members at the DB
  // layer. Public but rate-limited, capped at 8.
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("public_members")
    .select("id, name, status, roll")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(8);

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data ?? []);
}
