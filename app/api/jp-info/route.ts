import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { jpInfo } from "@/lib/public-data";

// GET /api/jp-info — public data for the homepage JP cards (see jpInfo in
// lib/public-data.ts; the homepage also renders it on the server).
export async function GET(req: Request) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await jpInfo(createServiceClient());
  if (!body) return NextResponse.json({ error: "Failed to load fines" }, { status: 500 });
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
