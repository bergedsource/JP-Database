import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/users — list all admin users with roles
export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("admin_roles")
    .select("user_id, role, email, created_at")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/users — create a new admin user with email + password + role
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { email, password, role } = await req.json();
  if (!email || !password || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "email, password, and role (owner|admin) are required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Create the Supabase auth user
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });

  // Insert into admin_roles
  const { error: roleError } = await service
    .from("admin_roles")
    .insert({ user_id: created.user.id, role, email });

  if (roleError) {
    // Rollback: delete the auth user if role insert fails
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: created.user.id });
}
