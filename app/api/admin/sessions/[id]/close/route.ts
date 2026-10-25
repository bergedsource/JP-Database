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
    .select("closed_at, date_held")
    .eq("id", id)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at !== null) return NextResponse.json({ success: true }); // already closed

  const { error } = await service
    .from("jp_sessions")
    .update({ closed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The night is over: drop every phone number and ticket link taken for it, and
  // close the tickets that were still open.
  await service
    .from("jp_tickets")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("session_date", session.date_held)
    .neq("status", "cancelled");
  await service
    .from("jp_tickets")
    .update({ phone: null, snapchat: null, token_hash: null, proxy_name: null })
    .eq("session_date", session.date_held);

  return NextResponse.json({ success: true });
}
