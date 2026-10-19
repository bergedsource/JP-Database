import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isRateLimited, getIP, adminLimiter } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const MAX_DESCRIPTION = 1000;
const MAX_NOTES = 5000;

// Edit a fine's description and private notes. Works for any fine, including ones in closed JP sessions.
// Notes stay admin-only: the public lookup reads a view with no notes column.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  if (await isRateLimited(adminLimiter, getIP(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!description) return NextResponse.json({ error: "Description is required" }, { status: 400 });
  if (description.length > MAX_DESCRIPTION) {
    return NextResponse.json({ error: `Description must be ${MAX_DESCRIPTION} characters or fewer` }, { status: 400 });
  }
  if (notes.length > MAX_NOTES) {
    return NextResponse.json({ error: `Notes must be ${MAX_NOTES} characters or fewer` }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: fine } = await service
    .from("fines")
    .select("fine_type, description, notes, members(name)")
    .eq("id", id)
    .single();

  if (!fine) return NextResponse.json({ error: "Fine not found" }, { status: 404 });

  const { error } = await service
    .from("fines")
    .update({ description, notes: notes || null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const changed = [
    fine.description !== description && "description",
    (fine.notes ?? "") !== notes && "notes",
  ].filter(Boolean).join(" and ");

  if (changed) {
    const memberName = (fine as unknown as { members?: { name: string } }).members?.name ?? "Unknown";
    const table = current.role === "root" ? "system_events" : "audit_logs";
    await service.from(table).insert({
      admin_email: current.email,
      action: "Edited Fine Details",
      details: `${memberName} — ${fine.fine_type}: edited ${changed}`,
    });
  }

  return NextResponse.json({ success: true, description, notes: notes || null });
}
