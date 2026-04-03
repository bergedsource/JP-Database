import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/users — list all admin users with roles
// Creator sees themselves + all others; owners never see creator entries
export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  const service = createServiceClient();

  let query = service
    .from("admin_roles")
    .select("user_id, role, email, created_at")
    .order("created_at");

  // Owners cannot see creator entries; creators can see their own entry
  if (current?.role !== "root") {
    query = query.neq("role", "root");
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/users — create a new admin user with email + password + role
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { email, password, role } = await req.json();

  // Input validation
  if (typeof email !== "string" || typeof password !== "string" || typeof role !== "string") {
    return NextResponse.json({ error: "Invalid input types" }, { status: 400 });
  }
  const trimmedEmail = email.trim().slice(0, 254);
  const trimmedPassword = password.slice(0, 72); // bcrypt max
  if (!trimmedEmail || !trimmedPassword) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (trimmedPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "role must be owner or admin" }, { status: 400 });
  }

  const service = createServiceClient();

  // Create the Supabase auth user
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: trimmedEmail,
    password: trimmedPassword,
    email_confirm: true,
  });

  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });

  // Insert into admin_roles
  const { error: roleError } = await service
    .from("admin_roles")
    .insert({ user_id: created.user.id, role, email: trimmedEmail });

  if (roleError) {
    // Rollback: delete the auth user if role insert fails
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: created.user.id });
}
