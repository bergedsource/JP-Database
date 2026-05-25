import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { UUID_RE } from "@/lib/unbecomings-validation";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; aid: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, aid } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(aid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: row } = await service
    .from("unbecoming_attachments")
    .select("id, file_path, unbecoming_id")
    .eq("id", aid)
    .eq("unbecoming_id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const { error: rmErr } = await service.storage.from("unbecomings").remove([row.file_path]);
  if (rmErr) {
    return NextResponse.json({ error: `Storage delete failed: ${rmErr.message}` }, { status: 500 });
  }

  const { error: rowErr } = await service.from("unbecoming_attachments").delete().eq("id", aid);
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Unbecoming attachment deleted",
    details: "",
  });

  return NextResponse.json({ success: true });
}
