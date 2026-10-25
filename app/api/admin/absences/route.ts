import { requireAuth } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// GET /api/admin/absences — JP no-shows this year, per member:
// { [member_id]: { count, dates: ["YYYY-MM-DD", …] } }
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("jp_absences")
    .select("member_id, session_date")
    .order("session_date", { ascending: false });
  if (error) return NextResponse.json({});

  const out: Record<string, { count: number; dates: string[] }> = {};
  for (const r of data ?? []) {
    const e = (out[r.member_id] ??= { count: 0, dates: [] });
    e.count += 1;
    e.dates.push(r.session_date);
  }
  return NextResponse.json(out);
}
