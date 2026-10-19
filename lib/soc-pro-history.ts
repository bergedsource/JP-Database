import type { createServiceClient } from "@/lib/supabase/service";

type Service = ReturnType<typeof createServiceClient>;

type SocProRow = {
  member_id: string;
  reason: string;
  notes: string | null;
  start_date: string;
  end_date: string | null;
  source: string;
  members: { name: string } | null;
};

// Copy soc pro rows into social_probation_history before they're deleted.
// Best-effort: a failure here (e.g. history table not created yet) must never block the removal itself.
export async function archiveSocPro(service: Service, ids: string[], removedBy: string, removalReason: string): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { data } = await service
      .from("social_probation")
      .select("member_id, reason, notes, start_date, end_date, source, members(name)")
      .in("id", ids);

    const rows = (data ?? []) as unknown as SocProRow[];
    if (rows.length === 0) return;

    const { error } = await service.from("social_probation_history").insert(
      rows.map((r) => ({
        member_id: r.member_id,
        member_name: r.members?.name ?? "Unknown",
        reason: r.reason,
        notes: r.notes,
        start_date: r.start_date,
        end_date: r.end_date,
        source: r.source,
        removed_by: removedBy,
        removal_reason: removalReason,
      }))
    );
    if (error) console.error("archiveSocPro insert failed:", error.message);
  } catch (e) {
    console.error("archiveSocPro failed:", e);
  }
}
