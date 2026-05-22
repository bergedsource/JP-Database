import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { roll } = await req.json();

  if (roll !== null) {
    if (!Number.isInteger(roll) || roll < 1 || roll > 99999) {
      return NextResponse.json(
        { error: "Roll # must be an integer between 1 and 99999, or null" },
        { status: 400 }
      );
    }
  }

  const service = createServiceClient();

  const { data: member } = await service
    .from("members")
    .select("name, roll")
    .eq("id", id)
    .single();

  const { error } = await service.from("members").update({ roll }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (member) {
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Updated Member Roll #",
      details: `${member.name} changed Roll # from ${member.roll ?? "—"} to ${roll ?? "—"}`,
    });
  }

  return NextResponse.json({ success: true });
}
