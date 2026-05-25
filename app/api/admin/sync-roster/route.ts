import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { syncMasterRoster } from "@/lib/sync-roster";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const denied = await requireOwner();
  if (denied) return denied;

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const service = createServiceClient();

  try {
    const summary = await syncMasterRoster({ service, dryRun });
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await service.from("audit_logs").insert({
      admin_email: "system",
      action: "Master Roster Sync — FAILED",
      details: msg.slice(0, 500),
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
