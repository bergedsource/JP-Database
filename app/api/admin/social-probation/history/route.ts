import { requireAuth } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/admin/social-probation/history — past soc pro entries, newest removal first
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("social_probation_history")
    .select("*")
    .order("removed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
