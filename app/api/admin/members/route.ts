import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, status, roll } = await req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validStatuses = ["active", "pledge", "alumni", "inactive", "resident-advisor", "live-out"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const service = createServiceClient();

  const { error } = await service.from("members").insert({
    name: name.trim(),
    status,
    roll: roll ? parseInt(roll) : null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const table = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(table).insert({
    admin_email: current.email,
    action: "Added Member",
    details: `${name.trim()} (${status})${roll ? ` — Roll ${roll}` : ""}`,
  });

  return NextResponse.json({ success: true });
}
