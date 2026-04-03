import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = Date.now();
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split("T")[0];

  // --- Auto-escalate overdue pending fines ---
  const { data: overdue } = await service
    .from("fines")
    .select("id, fine_type, members(name)")
    .eq("status", "pending")
    .lt("created_at", twoWeeksAgo);

  if (overdue && overdue.length > 0) {
    const ids = (overdue as { id: string }[]).map((f) => f.id);
    await service.from("fines").update({ status: "upheld" }).in("id", ids);

    for (const fine of overdue as unknown as { id: string; fine_type: string; members?: { name: string } }[]) {
      await service.from("audit_logs").insert({
        admin_email: "system",
        action: "Auto-Escalated Fine",
        details: `${fine.members?.name ?? "Unknown"} — ${fine.fine_type} auto-escalated to "upheld" (pending > 2 weeks)`,
      });
    }
  }

  // --- Auto-detect social probation ---
  const [{ data: upheldFines }, { data: autoSP }] = await Promise.all([
    service.from("fines").select("member_id, amount, created_at").eq("status", "upheld"),
    service
      .from("social_probation")
      .select("id, member_id")
      .eq("source", "auto")
      .eq("reason", "Outstanding Fines (§10-270)")
      .is("end_date", null),
  ]);

  if (upheldFines) {
    const memberData = new Map<string, { totalOwed: number; oldestCreated: string }>();
    for (const fine of upheldFines as { member_id: string; amount: number | null; created_at: string }[]) {
      const existing = memberData.get(fine.member_id);
      if (!existing) {
        memberData.set(fine.member_id, { totalOwed: fine.amount ?? 0, oldestCreated: fine.created_at });
      } else {
        existing.totalOwed += fine.amount ?? 0;
        if (fine.created_at < existing.oldestCreated) existing.oldestCreated = fine.created_at;
      }
    }

    const qualifying = new Set<string>();
    for (const [memberId, data] of memberData) {
      if (data.totalOwed > 20 || data.oldestCreated < oneWeekAgo) qualifying.add(memberId);
    }

    const alreadyOn = new Set((autoSP ?? []).map((sp: { id: string; member_id: string }) => sp.member_id));
    const toAdd = [...qualifying].filter((id) => !alreadyOn.has(id));
    const toRemove = (autoSP ?? []).filter(
      (sp: { id: string; member_id: string }) => !qualifying.has(sp.member_id)
    ) as { id: string; member_id: string }[];

    if (toAdd.length > 0 || toRemove.length > 0) {
      const allIds = [...toAdd, ...toRemove.map((sp) => sp.member_id)];
      const { data: nameData } = await service.from("members").select("id, name").in("id", allIds);
      const nameMap = new Map((nameData ?? []).map((m: { id: string; name: string }) => [m.id, m.name]));

      for (const memberId of toAdd) {
        await service.from("social_probation").insert({
          member_id: memberId,
          reason: "Outstanding Fines (§10-270)",
          start_date: today,
          source: "auto",
        });
        await service.from("audit_logs").insert({
          admin_email: "system",
          action: "Auto Social Probation",
          details: `${nameMap.get(memberId) ?? "Unknown"} placed on social probation — outstanding fines per §10-270`,
        });
      }

      for (const sp of toRemove) {
        await service.from("social_probation").update({ end_date: today }).eq("id", sp.id);
        await service.from("audit_logs").insert({
          admin_email: "system",
          action: "Auto Social Probation Lifted",
          details: `${nameMap.get(sp.member_id) ?? "Unknown"} removed from social probation — fines resolved`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, escalated: overdue?.length ?? 0 });
}
