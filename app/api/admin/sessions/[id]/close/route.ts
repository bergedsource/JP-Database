import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// POST /api/admin/sessions/[id]/close — mark a session as closed
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  const service = createServiceClient();

  const { data: session } = await service
    .from("jp_sessions")
    .select("closed_at")
    .eq("id", id)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at !== null) return NextResponse.json({ success: true }); // already closed

  const { error } = await service
    .from("jp_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
