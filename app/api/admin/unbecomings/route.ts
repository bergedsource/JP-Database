import { getCurrentRole, requireOwner } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { validateCreate } from "@/lib/unbecomings-validation";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service
    .from("unbecomings")
    .select("*, members(name), unbecoming_attachments(id)")
    .order("incident_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type RawRow = {
    members?: { name: string } | null;
    unbecoming_attachments?: Array<{ id: string }>;
    [key: string]: unknown;
  };

  const rows = (data ?? []).map((u) => {
    const r = u as RawRow;
    return {
      ...r,
      member_name: r.members?.name,
      attachment_count: r.unbecoming_attachments?.length ?? 0,
      members: undefined,
      unbecoming_attachments: undefined,
    };
  });

  return NextResponse.json({ unbecomings: rows });
}

export async function POST(req: NextRequest) {
  const denied = await requireOwner();
  if (denied) return denied;
  const current = await getCurrentRole();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const validation = validateCreate(body);
  if ("error" in validation) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: memberExists } = await service
    .from("members")
    .select("id")
    .eq("id", validation.member_id)
    .maybeSingle();
  if (!memberExists) {
    return NextResponse.json({ error: "Member not found" }, { status: 400 });
  }

  const { data, error } = await service
    .from("unbecomings")
    .insert({
      member_id: validation.member_id,
      incident_date: validation.incident_date,
      title: validation.title,
      body: validation.body,
      status: validation.status,
      decision: validation.decision,
      decision_date: validation.decision_date,
      sanction: validation.sanction,
      created_by: current.email,
      updated_by: current.email,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditTable = current.role === "root" ? "system_events" : "audit_logs";
  await service.from(auditTable).insert({
    admin_email: current.email,
    action: "Unbecoming created",
    details: "",
  });

  return NextResponse.json({ id: data.id });
}
