import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Verifies the caller knows their own Supabase login password.
// Used as the gate for the Unbecomings tab — owner/root only.
//
// Implementation note: we cannot use supabase.auth.signInWithPassword on the
// user's cookie-bound client because that would rotate their session tokens
// (and on Next.js cookies are read-only here anyway). Instead we make an
// ephemeral anon client, attempt signInWithPassword there, then discard the
// returned tokens — the caller's real session is untouched.

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { password } = await req.json();
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const ephemeral = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await ephemeral.auth.signInWithPassword({
    email: current.email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
