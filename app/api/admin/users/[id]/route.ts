import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cannot delete yourself
  if (current?.userId === id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  const service = createServiceClient();

  // Check target is not the only owner
  const { data: targetRole } = await service
    .from("admin_roles")
    .select("role, email")
    .eq("user_id", id)
    .maybeSingle();

  // Only admin accounts can be removed here.
  if (!targetRole) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (targetRole.role === "root") {
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
  const { error: roleError } = await service.from("admin_roles").delete().eq("user_id", id);
  if (roleError) return NextResponse.json({ error: "Couldn't remove user. Try again." }, { status: 500 });
  const { error } = await service.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await service.from(current.role === "root" ? "system_events" : "audit_logs").insert({
    admin_email: current.email,
    action: "Removed Admin User",
    details: `${targetRole.email ?? id} (${targetRole.role})`,
  });

  return NextResponse.json({ success: true });
}
