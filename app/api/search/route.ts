import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, name, status, roll")
    .ilike("name", `%${q}%`)
    .in("status", ["active", "pledge"])
    .order("name")
    .limit(8);

  if (error) return NextResponse.json([], { status: 500 });
  return NextResponse.json(data ?? []);
}
