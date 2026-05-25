import { requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { UUID_RE } from "@/lib/unbecomings-validation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; aid: string }> }
) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { id, aid } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(aid)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: row } = await service
    .from("unbecoming_attachments")
    .select("file_path, file_name")
    .eq("id", aid)
    .eq("unbecoming_id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const { data, error } = await service.storage
    .from("unbecomings")
    .createSignedUrl(row.file_path, 60, { download: row.file_name });
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to sign URL" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, file_name: row.file_name });
}
