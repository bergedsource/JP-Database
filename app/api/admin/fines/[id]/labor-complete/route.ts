import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: fine } = await service
    .from("fines")
    .select("fine_type, status, labor_completed_at, member_id, members(name)")
    .eq("id", id)
    .single();

  if (!fine) return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  if (fine.status !== "labor") {
    return NextResponse.json({ error: "Fine is not assigned labor" }, { status: 409 });
  }
  if (fine.labor_completed_at) return NextResponse.json({ success: true });

  const today = new Date().toISOString().split("T")[0];
  const { error } = await service
    .from("fines")
    .update({ labor_completed_at: today })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Completed Labor",
    details: `${memberName} — ${fine.fine_type}: labor marked complete`,
  });

  return NextResponse.json({ success: true });
}
