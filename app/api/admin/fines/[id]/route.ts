import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (await isRateLimited(adminLimiter, getIP(_req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: fine } = await service
    .from("fines")
    .select("fine_type, term, member_id, members(name)")
    .eq("id", id)
    .single();

  const { error } = await service.from("fines").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (fine) {
    const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Deleted Fine",
      details: `${memberName} — ${fine.fine_type} (${fine.term})`,
    });
  }

  return NextResponse.json({ success: true });
}
