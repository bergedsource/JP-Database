import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const service = createServiceClient();

  const { data: sp } = await service
    .from("social_probation")
    .select("member_id, reason, members(name)")
    .eq("id", id)
    .single();

  const { error } = await service
    .from("social_probation")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (sp) {
    const memberName = (sp as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    await service.from("audit_logs").insert({
      admin_email: current.email,
      action: "Removed Social Probation",
      details: `${memberName} — ${sp.reason} lifted`,
    });
  }

  return NextResponse.json({ success: true });
}
