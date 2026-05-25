import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// Returns { counts: { <member_id>: <count>, ... } } for use on the
// Members tab. Owner+root only — the count itself is sensitive (knowing
// a member has any Unbecomings exposes the existence of disciplinary
// records to anyone who can read the response).

export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service.from("unbecomings").select("member_id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.member_id] = (counts[row.member_id] ?? 0) + 1;
  }

  return NextResponse.json({ counts });
}
