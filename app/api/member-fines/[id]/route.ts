import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, getIP, publicLimiter } from "@/lib/rate-limit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (await isRateLimited(publicLimiter, getIP(_req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json([], { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fines")
    .select("id, member_id, fine_type, description, amount, status, term, date_issued, date_resolved, fining_officer, created_at")
    .eq("member_id", id)
    .order("date_issued", { ascending: false });

  // notes is intentionally excluded from the select above
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data ?? []);
}
