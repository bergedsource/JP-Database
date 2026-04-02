import { createClient } from "@/lib/supabase/server";

export type AdminRole = "owner" | "admin" | null;

/**
 * Get the current logged-in user's role from admin_roles.
 * Returns null if not authenticated or not in admin_roles.
 */
export async function getCurrentRole(): Promise<{ userId: string; role: AdminRole; email: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("admin_roles")
    .select("role, email")
    .eq("user_id", user.id)
    .single();

  if (!data) return null;
  return { userId: user.id, role: data.role as AdminRole, email: data.email };
}

/**
 * Require owner role. Returns 403 response if not owner.
 * Usage: const check = await requireOwner(); if (check) return check;
 */
export async function requireOwner(): Promise<Response | null> {
  const current = await getCurrentRole();
  if (!current || current.role !== "owner") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  return null;
}

/**
 * Require any authenticated admin role (owner or admin).
 */
export async function requireAuth(): Promise<Response | null> {
  const current = await getCurrentRole();
  if (!current) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  return null;
}
