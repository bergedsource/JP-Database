import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";
import { waitFor } from "@/lib/jp-info";
import { loadDocket } from "@/lib/jp-docket";

// GET /api/jp-wait/[id] — estimate when a brother will be called at JP. The docket
// is grouped by fining officer (see docketOrder in lib/jp-info.ts). Only counts and
// minutes come back — never who else is on the docket.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (await isRateLimited(publicLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing member id" }, { status: 400 });

  let docket;
  try {
    docket = await loadDocket(createServiceClient());
  } catch {
    return NextResponse.json({ error: "Failed to load docket" }, { status: 500 });
  }

  return NextResponse.json(waitFor(id, docket.slots, docket.minutes, docket.skipped), {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
