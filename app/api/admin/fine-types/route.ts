import { requireAuth, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

// GET /api/admin/fine-types — list all custom fine types
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("custom_fine_types")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/fine-types — create a custom fine type
export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { name, bylaw_number, default_amount, description } = await req.json();
  if (!name || !bylaw_number) {
    return NextResponse.json({ error: "name and bylaw_number are required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("custom_fine_types")
    .insert({ name: name.trim(), bylaw_number: bylaw_number.trim(), default_amount: default_amount || null, description: description?.trim() || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/admin/fine-types — delete a custom fine type
export async function DELETE(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from("custom_fine_types").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
