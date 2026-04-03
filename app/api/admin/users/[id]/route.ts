import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const current = await getCurrentRole();

  // Cannot delete yourself
  if (current?.userId === id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  const service = createServiceClient();

  // Check target is not the only owner
  const { data: targetRole } = await service
    .from("admin_roles")
    .select("role")
    .eq("user_id", id)
    .single();

  if (targetRole?.role === "root") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (targetRole?.role === "owner" && current?.role !== "root") {
    const { count } = await service
      .from("admin_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot remove the only owner" }, { status: 400 });
    }
  }

  // Delete from admin_roles (cascade will not delete auth user — we delete both)
  await service.from("admin_roles").delete().eq("user_id", id);
  const { error } = await service.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
