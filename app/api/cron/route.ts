import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

async function sendEmail(to: string[], subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@jp-database.vercel.app";
  await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
}

async function getAdminEmails(service: ReturnType<typeof createServiceClient>): Promise<string[]> {
  const { data } = await service
    .from("admin_roles")
    .select("email, role")
    .in("role", ["owner", "root"]);
  return (data ?? []).map((r: { email: string }) => r.email).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-indexed
  const day = now.getUTCDate();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().split("T")[0];

  // --- Annual warning: January 3rd ---
  if (month === 1 && day === 3) {
    const emails = await getAdminEmails(service);
    if (emails.length > 0) {
      await sendEmail(
        emails,
        "⚠️ JP Database — Fines will be cleared in 24 hours",
        `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0D1117;color:#E6EDF3;border-radius:12px;">
          <div style="width:3px;height:28px;background:#CFB53B;border-radius:2px;margin-bottom:20px;"></div>
          <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#E6EDF3;">Annual Fines Cleanup — 24 Hour Warning</h2>
          <p style="color:#8B949E;font-size:13px;margin:0 0 20px;">Acacia Fraternity · Oregon State Chapter</p>
          <p style="font-size:14px;line-height:1.7;color:#E6EDF3;">
            All fine records in the JP database will be <strong style="color:#F87171;">automatically deleted tomorrow, January 4th at 11:59 PM</strong>.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#E6EDF3;margin-top:16px;">
            If you need to keep any records, please export them now using the <strong style="color:#CFB53B;">Term Export</strong> feature in the Transition tab before they are deleted.
          </p>
          <div style="margin-top:28px;padding:16px;background:#161B22;border-radius:8px;border:1px solid #30363D;">
            <p style="margin:0;font-size:12px;color:#8B949E;">This is an automated message from the JP Database. The cleanup runs every year on January 4th.</p>
          </div>
        </div>`
      );
    }
  }

  // --- Annual deletion: January 4th ---
  if (month === 1 && day === 4) {
    const { count } = await service
      .from("fines")
      .select("*", { count: "exact", head: true });

    // Delete all auto soc pro entries (manual ones are preserved)
    await service.from("social_probation").delete().eq("source", "auto");
    // Delete all fines
    await service.from("fines").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    await service.from("audit_logs").insert({
      admin_email: "system",
      action: "Annual Fines Cleanup",
      details: `${count ?? 0} fine records deleted in annual January cleanup`,
    });

    const emails = await getAdminEmails(service);
    if (emails.length > 0) {
      await sendEmail(
        emails,
        "✅ JP Database — Annual fines cleanup complete",
        `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0D1117;color:#E6EDF3;border-radius:12px;">
          <div style="width:3px;height:28px;background:#CFB53B;border-radius:2px;margin-bottom:20px;"></div>
          <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#E6EDF3;">Annual Fines Cleanup Complete</h2>
          <p style="color:#8B949E;font-size:13px;margin:0 0 20px;">Acacia Fraternity · Oregon State Chapter</p>
          <p style="font-size:14px;line-height:1.7;color:#E6EDF3;">
            The JP database has been cleared. <strong style="color:#34D399;">${count ?? 0} fine records</strong> were deleted.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#E6EDF3;margin-top:16px;">
            The database is now ready for the new year. Member records and audit logs have been preserved.
          </p>
          <div style="margin-top:28px;padding:16px;background:#161B22;border-radius:8px;border:1px solid #30363D;">
            <p style="margin:0;font-size:12px;color:#8B949E;">This is an automated message from the JP Database.</p>
          </div>
        </div>`
      );
    }
  }

  // --- Term rollover reminders ---
  // Winter: Jan 5 (day after cleanup), Spring: Apr 1, Summer: Jul 1, Fall: Sep 1
  const termRollover: Record<string, string> = {
    "1-5":  "Winter",
    "4-1":  "Spring",
    "7-1":  "Summer",
    "9-1":  "Fall",
  };
  const termName = termRollover[`${month}-${day}`];
  if (termName) {
    const year = now.getUTCFullYear();
    const prevTermNames: Record<string, string> = {
      Winter: `Fall ${year - 1}`,
      Spring: `Winter ${year}`,
      Summer: `Spring ${year}`,
      Fall:   `Summer ${year}`,
    };
    const prevTerm = prevTermNames[termName];
    const emails = await getAdminEmails(service);
    if (emails.length > 0) {
      await sendEmail(
        emails,
        `📋 JP Database — ${termName} ${year} term has started`,
        `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0D1117;color:#E6EDF3;border-radius:12px;">
          <div style="width:3px;height:28px;background:#CFB53B;border-radius:2px;margin-bottom:20px;"></div>
          <h2 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#E6EDF3;">${termName} ${year} Term Started</h2>
          <p style="color:#8B949E;font-size:13px;margin:0 0 20px;">Acacia Fraternity · Oregon State Chapter</p>
          <p style="font-size:14px;line-height:1.7;color:#E6EDF3;">
            A new term has begun. Before issuing new fines, make sure last term's records are exported.
          </p>
          <div style="margin-top:16px;padding:16px;background:#161B22;border-radius:8px;border:1px solid rgba(207,181,59,0.3);">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#CFB53B;">Action required</p>
            <p style="margin:0;font-size:13px;color:#E6EDF3;">Export <strong>${prevTerm}</strong> fines to Google Sheets using the <strong>Term Export</strong> feature in the Transition tab if you haven't already.</p>
          </div>
          <div style="margin-top:28px;padding:16px;background:#161B22;border-radius:8px;border:1px solid #30363D;">
            <p style="margin:0;font-size:12px;color:#8B949E;">This is an automated message from the JP Database.</p>
          </div>
        </div>`
      );
    }
  }

  // --- Daily: Auto-escalate overdue pending fines ---
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

  // --- Daily: Auto-detect social probation ---
  const [{ data: upheldFines }, { data: autoSP }] = await Promise.all([
    service.from("fines").select("member_id, amount, created_at").eq("status", "upheld"),
    service.from("social_probation").select("id, member_id").eq("source", "auto").eq("reason", "Outstanding Fines (§10-270)").is("end_date", null),
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
    const toRemove = (autoSP ?? []).filter((sp: { id: string; member_id: string }) => !qualifying.has(sp.member_id)) as { id: string; member_id: string }[];

    if (toAdd.length > 0 || toRemove.length > 0) {
      const allIds = [...toAdd, ...toRemove.map((sp) => sp.member_id)];
      const { data: nameData } = await service.from("members").select("id, name").in("id", allIds);
      const nameMap = new Map((nameData ?? []).map((m: { id: string; name: string }) => [m.id, m.name]));

      for (const memberId of toAdd) {
        await service.from("social_probation").insert({ member_id: memberId, reason: "Outstanding Fines (§10-270)", start_date: today, source: "auto" });
        await service.from("audit_logs").insert({ admin_email: "system", action: "Auto Social Probation", details: `${nameMap.get(memberId) ?? "Unknown"} placed on social probation — outstanding fines per §10-270` });
      }
      for (const sp of toRemove) {
        await service.from("social_probation").update({ end_date: today }).eq("id", sp.id);
        await service.from("audit_logs").insert({ admin_email: "system", action: "Auto Social Probation Lifted", details: `${nameMap.get(sp.member_id) ?? "Unknown"} removed from social probation — fines resolved` });
      }
    }
  }

  return NextResponse.json({ ok: true, escalated: overdue?.length ?? 0 });
}
