import { requireAuth } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();

  // Supabase caps each response at 1000 rows server-side; chapter_roster has ~1400.
  // Paginate via .range() until a short page comes back.
  const PAGE = 1000;
  const all: Array<{ roll: number; name: string; big_brother_roll: number | null }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await service
      .from("chapter_roster")
      .select("roll, name, big_brother_roll")
      .range(from, from + PAGE - 1)
      .order("roll", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ entries: all });
}
