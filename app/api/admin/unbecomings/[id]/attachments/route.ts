import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { UUID_RE, sanitizeFilename } from "@/lib/unbecomings-validation";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const MAX_FILE_BYTES = 52_428_800; // 50 MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid unbecoming id" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected multipart form field 'file'" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds 50 MB limit" }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify the unbecoming exists before writing storage objects.
  const { data: parent } = await service
    .from("unbecomings")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!parent) return NextResponse.json({ error: "Unbecoming not found" }, { status: 404 });

  const cleanName = sanitizeFilename(file.name || "attachment");
  const storagePath = `${id}/${randomUUID()}-${cleanName}`;

  const bytes = await file.arrayBuffer();
  const { error: upErr } = await service.storage
    .from("unbecomings")
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "no-store",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data: row, error: rowErr } = await service
    .from("unbecoming_attachments")
    .insert({
      unbecoming_id: id,
      file_path: storagePath,
      file_name: cleanName,
      file_size_bytes: file.size,
      mime_type: file.type || null,
      uploaded_by: current.email,
    })
    .select("*")
    .single();

  if (rowErr) {
    // Best-effort cleanup of the storage object we just wrote.
    await service.storage.from("unbecomings").remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Unbecoming attachment added",
    details: "",
  });

  return NextResponse.json({ attachment: row });
}
