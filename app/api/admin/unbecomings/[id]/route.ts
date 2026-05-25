import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { validateUpdate, UUID_RE } from "@/lib/unbecomings-validation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("unbecomings")
    .select("*, members(name), unbecoming_attachments(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  type Row = {
    members?: { name: string } | null;
    unbecoming_attachments?: unknown[];
    [key: string]: unknown;
  };
  const row = data as Row;

  return NextResponse.json({
    unbecoming: {
      ...row,
      member_name: row.members?.name,
      attachments: row.unbecoming_attachments ?? [],
      members: undefined,
      unbecoming_attachments: undefined,
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const validation = validateUpdate(body);
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (Object.keys(validation).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const service = createServiceClient();

  if (validation.member_id) {
    const { data: memberExists } = await service
      .from("members")
      .select("id")
      .eq("id", validation.member_id)
      .maybeSingle();
    if (!memberExists) return NextResponse.json({ error: "Member not found" }, { status: 400 });
  }

  const { error } = await service
    .from("unbecomings")
    .update({
      ...validation,
      updated_at: new Date().toISOString(),
      updated_by: current.email,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Unbecoming updated",
    details: "",
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const service = createServiceClient();

  // Collect attachment paths so we can purge their storage objects.
  const { data: attachments } = await service
    .from("unbecoming_attachments")
    .select("file_path")
    .eq("unbecoming_id", id);

  const paths = (attachments ?? []).map((a) => a.file_path);
  if (paths.length > 0) {
    const { error: rmErr } = await service.storage.from("unbecomings").remove(paths);
    if (rmErr) {
      return NextResponse.json(
        { error: `Failed to remove attached files: ${rmErr.message}` },
        { status: 500 }
      );
    }
  }

  // DB cascade removes the attachment rows.
  const { error } = await service.from("unbecomings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Unbecoming deleted",
    details: "",
  });

  return NextResponse.json({ success: true });
}
