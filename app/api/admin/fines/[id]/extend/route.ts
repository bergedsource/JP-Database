import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { EXTENSION_DAYS } from "@/lib/overdue";
import { NextRequest, NextResponse } from "next/server";

// Give a pending fine another week before it's flagged overdue again.
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
    .select("fine_type, status, members(name)")
    .eq("id", id)
    .single();

  if (!fine) return NextResponse.json({ error: "Fine not found" }, { status: 404 });
  if (fine.status !== "pending") {
    return NextResponse.json({ error: "Only pending fines can be extended" }, { status: 409 });
  }

  const deadline = new Date(Date.now() + EXTENSION_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await service
    .from("fines")
    .update({ review_deadline: deadline.toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Extended Fine Review",
    details: `${memberName} — ${fine.fine_type}: review extended to ${deadline.toISOString().split("T")[0]}`,
  });

  return NextResponse.json({ success: true, review_deadline: deadline.toISOString() });
}
