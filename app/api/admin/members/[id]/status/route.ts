import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json();

  const validStatuses = ["active", "pledge", "alumni", "inactive", "resident-advisor", "live-out"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: member } = await service
    .from("members")
    .select("name, status")
    .eq("id", id)
    .single();

  const { error } = await service.from("members").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (member) {
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Updated Member Status",
      details: `${member.name} changed from "${member.status}" to "${status}"`,
    });
  }

  return NextResponse.json({ success: true });
}
