import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// GET /api/admin/fines/notes — private fine notes, owners/root only:
// { [fine_id]: notes }. View-only admins can't read the notes column directly
// (see migration_hide_fine_notes.sql), so the dashboard merges these in.
export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("fines")
    .select("id, notes")
    .not("notes", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.notes) out[r.id] = r.notes;
  return NextResponse.json(out);
}
