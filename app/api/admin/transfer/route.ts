import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/transfer — atomically promote targetUserId to owner, demote self to admin
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { targetUserId } = await req.json();
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
  }

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (current.role === "root") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (current.userId === targetUserId) {
    return NextResponse.json({ error: "You are already the owner" }, { status: 400 });
  }

  const service = createServiceClient();

  // Promote target to owner
  const { error: promoteError } = await service
    .from("admin_roles")
    .update({ role: "owner" })
    .eq("user_id", targetUserId);

  if (promoteError) return NextResponse.json({ error: promoteError.message }, { status: 500 });

  // Demote current user to admin
  const { error: demoteError } = await service
    .from("admin_roles")
    .update({ role: "admin" })
    .eq("user_id", current.userId);

  if (demoteError) {
    // Rollback: demote target back to admin
    await service.from("admin_roles").update({ role: "admin" }).eq("user_id", targetUserId);
    return NextResponse.json({ error: demoteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
