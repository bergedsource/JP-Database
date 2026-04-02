import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json([], { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fines")
    .select("id, member_id, fine_type, description, amount, status, term, date_issued, date_resolved, created_at")
    .eq("member_id", id)
    .order("date_issued", { ascending: false });

  // notes is intentionally excluded from the select above
  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data ?? []);
}
