"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { AuditLog, Fine, FineStatus, FineType, Member, SocialProbation, SocialProbationReason } from "@/lib/types";

const FINE_TYPES: FineType[] = [
  "Conduct Unbecoming (§11-010)",
  "General Misconduct (§11-020)",
  "Misconduct Under Influence (§11-030)",
  "Missing Security at Function (§11-050)",
  "Missing Required Event (§11-060)",
  "Missing Recruitment/Work Week (§11-070)",
  "Removal/Damage to House Property (§11-080)",
  "Removal/Damage to Personal Property (§11-090)",
  "Missing Chapter Meeting (§11-100)",
  "Missing Exec Meeting (§11-110)",
  "Missing Yearbook/Composite (§11-120)",
  "Kitchen Duties (§11-130)",
  "House Clean (§11-140)",
  "Event House Clean (§11-150)",
  "Chores (§11-160)",
  "Missing Philanthropy Event (§11-170)",
  "Smoking (§11-190)",
  "Fire Alarm (§11-200)",
  "Drop Testing Cleanup (§11-210)",
  "Unauthorized Weapon Use (§11-220)",
  "Sexual Relations on Sleeping Porch (§11-230)",
  "Formal Dinner Attire (§11-240)",
  "Grazers (§11-250)",
  "Social Probation Violation (§11-260)",
  "Missing House Philanthropy Event (§11-270)",
  "Missing Signed-Up Philanthropy Event (§11-280)",
  "Bathroom Trash Violation (§11-290)",
  "Physical Violence (§11-300)",
  "Committee Meeting Absence (§7-005)",
  "Missing JP Meeting (§10-220)",
  "Cell Phone in Exec Meeting (§8-060)",
  "Grievance Committee No-Show (§7-030)",
  "Guest Misconduct (§12-030)",
  "Breathalyzer Misuse (§12-080)",
  "Silent Sleeping Porch Violation (§18-350)",
  "Missing Blood Drive (§16-010)",
  "Missing Philanthropy Hours (§16-010)",
  "Vacant Room (§17-020)",
  "Room Improvement Removal (§17-240)",
  "Inadequate Room Space (§17-360)",
  "Failure to Vacate Room (§17-370)",
  "Other",
];

const STATUS_COLORS: Record<FineStatus, { bg: string; color: string; border: string }> = {
  pending:   { bg: "rgba(251,191,36,0.1)",   color: "#FCD34D", border: "rgba(251,191,36,0.3)" },
  upheld:    { bg: "rgba(239,68,68,0.1)",    color: "#F87171", border: "rgba(239,68,68,0.3)" },
  dismissed: { bg: "rgba(52,211,153,0.1)",   color: "#34D399", border: "rgba(52,211,153,0.3)" },
  paid:      { bg: "rgba(96,165,250,0.1)",   color: "#60A5FA", border: "rgba(96,165,250,0.3)" },
  labor:     { bg: "rgba(167,139,250,0.1)",  color: "#A78BFA", border: "rgba(167,139,250,0.3)" },
};

type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit" | "transition";

const SP_REASONS: SocialProbationReason[] = [
  "Outstanding Fines (§10-270)",
  "Academic - GPA Below 3.0 (§14-020)",
  "Academic - Cumulative GPA Below 2.0 (§14-060)",
  "Financial - Unpaid Dues (§9-140)",
  "Failure to Attend Ritual (§15-010)",
  "Failure to Complete Service Hours (§16-010)",
  "Missing House Philanthropy Event (§11-270)",
  "Other",
];

const FINE_DESCRIPTIONS: Partial<Record<FineType, string>> = {
  "Conduct Unbecoming (§11-010)": "Conduct unbecoming a member of Acacia Fraternity",
  "General Misconduct (§11-020)": "General misconduct in violation of chapter standards",
  "Misconduct Under Influence (§11-030)": "Misconduct while under the influence of alcohol or substances",
  "Missing Security at Function (§11-050)": "Failed to fulfill assigned security duty at a chapter function",
  "Missing Required Event (§11-060)": "Failed to attend a required chapter event",
  "Missing Recruitment/Work Week (§11-070)": "Failed to participate in recruitment or work week",
  "Removal/Damage to House Property (§11-080)": "Removed or caused damage to house property",
  "Removal/Damage to Personal Property (§11-090)": "Removed or caused damage to another member's personal property",
  "Missing Chapter Meeting (§11-100)": "Failed to attend a required chapter meeting",
  "Missing Exec Meeting (§11-110)": "Failed to attend a required executive board meeting",
  "Missing Yearbook/Composite (§11-120)": "Failed to appear for yearbook or composite photo",
  "Kitchen Duties (§11-130)": "Failed to complete assigned kitchen duties",
  "House Clean (§11-140)": "Failed to participate in scheduled house clean",
  "Event House Clean (§11-150)": "Failed to participate in post-event house clean",
  "Chores (§11-160)": "Failed to complete assigned chores",
  "Missing Philanthropy Event (§11-170)": "Failed to attend a required philanthropy event",
  "Smoking (§11-190)": "Smoking in violation of chapter policy",
  "Fire Alarm (§11-200)": "Caused or contributed to a false fire alarm",
  "Drop Testing Cleanup (§11-210)": "Failed to assist with drop testing cleanup",
  "Unauthorized Weapon Use (§11-220)": "Unauthorized possession or use of a weapon on chapter property",
  "Sexual Relations on Sleeping Porch (§11-230)": "Violation of sleeping porch conduct policy",
  "Formal Dinner Attire (§11-240)": "Failed to meet formal dinner dress code requirements",
  "Grazers (§11-250)": "Eating outside of designated meal times without authorization",
  "Social Probation Violation (§11-260)": "Violated terms of active social probation",
  "Missing House Philanthropy Event (§11-270)": "Failed to attend a required house philanthropy event",
  "Missing Signed-Up Philanthropy Event (§11-280)": "Failed to attend a philanthropy event they signed up for",
  "Bathroom Trash Violation (§11-290)": "Left trash or violation of bathroom cleanliness standards",
  "Physical Violence (§11-300)": "Engaged in physical violence or threatening behavior",
  "Committee Meeting Absence (§7-005)": "Failed to attend an assigned committee meeting",
  "Missing JP Meeting (§10-220)": "Failed to appear at a scheduled JP meeting",
  "Cell Phone in Exec Meeting (§8-060)": "Used cell phone during an executive board meeting",
  "Grievance Committee No-Show (§7-030)": "Failed to appear before the grievance committee",
  "Guest Misconduct (§12-030)": "Guest caused misconduct or violated chapter rules",
  "Breathalyzer Misuse (§12-080)": "Misuse or tampering with chapter breathalyzer equipment",
  "Silent Sleeping Porch Violation (§18-350)": "Violated quiet hours policy on the sleeping porch",
  "Missing Blood Drive (§16-010)": "Failed to attend the required blood drive",
  "Missing Philanthropy Hours (§16-010)": "Failed to complete required philanthropy service hours",
  "Vacant Room (§17-020)": "Left room vacant without proper notification",
  "Room Improvement Removal (§17-240)": "Removed chapter-approved room improvements without authorization",
  "Inadequate Room Space (§17-360)": "Failed to maintain adequate room space per chapter standards",
  "Failure to Vacate Room (§17-370)": "Failed to vacate room by the required date",
  "Other": "",
};

function getTermOptions(): string[] {
  const year = new Date().getFullYear();
  return [`Winter ${year}`, `Spring ${year}`, `Summer ${year}`, `Fall ${year}`];
}

function getCurrentTerm(): string {
  const month = new Date().getMonth() + 1; // 1-12
  const year = new Date().getFullYear();
  if (month <= 3) return `Winter ${year}`;
  if (month <= 6) return `Spring ${year}`;
  if (month <= 8) return `Summer ${year}`;
  return `Fall ${year}`;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fines");
  const [members, setMembers] = useState<Member[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [filterStatus, setFilterStatus] = useState<FineStatus | "all">("all");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [userRole, setUserRole] = useState<"owner" | "admin" | null>(null);
  const [adminUsers, setAdminUsers] = useState<{ user_id: string; email: string; role: string; created_at: string }[]>([]);
  const [newUserForm, setNewUserForm] = useState({ email: "", password: "", role: "admin" });
  const [newUserSubmitting, setNewUserSubmitting] = useState(false);
  const [newUserError, setNewUserError] = useState("");
  const [venmoForm, setVenmoForm] = useState({ venmo_handle: "", venmo_url: "" });
  const [venmoSaving, setVenmoSaving] = useState(false);
  const [venmoSaved, setVenmoSaved] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  // Fine form state
  const [fineForm, setFineForm] = useState({
    fine_type: "General Misconduct" as FineType,
    description: "",
    amount: "",
    term: getCurrentTerm(),
    date_issued: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [fineSubmitting, setFineSubmitting] = useState(false);
  const [fineError, setFineError] = useState("");

  // Member form state
  const [memberForm, setMemberForm] = useState({
    name: "",
    status: "active" as Member["status"],
    roll: "",
  });
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberError, setMemberError] = useState("");

  // Outstanding fine form state
  const [outForm, setOutForm] = useState({
    fine_type: "General Misconduct (§11-020)" as FineType,
    description: "",
    amount: "",
    term: getCurrentTerm(),
    date_issued: new Date().toISOString().split("T")[0],
    notes: "",
    place_on_soc_pro: false,
  });
  const [outMemberSearch, setOutMemberSearch] = useState("");
  const [outSelectedMember, setOutSelectedMember] = useState<Member | null>(null);
  const [showOutSuggestions, setShowOutSuggestions] = useState(false);
  const [outSubmitting, setOutSubmitting] = useState(false);
  const [outError, setOutError] = useState("");

  // Social probation state
  const [socialProbations, setSocialProbations] = useState<SocialProbation[]>([]);
  const [spForm, setSpForm] = useState({
    reason: "Outstanding Fines (§10-270)" as SocialProbationReason,
    notes: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
  });
  const [spMemberSearch, setSpMemberSearch] = useState("");
  const [spSelectedMember, setSpSelectedMember] = useState<Member | null>(null);
  const [showSpSuggestions, setShowSpSuggestions] = useState(false);
  const [spSubmitting, setSpSubmitting] = useState(false);
  const [spError, setSpError] = useState("");

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      await loadData();
      await autoEscalateOverdueFines();
      await autoDetectSocialProbation();
    })();
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email ?? "unknown");
    });
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setUserRole(d.role ?? null))
      .catch(() => {});
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: m }, { data: f }, { data: a }, { data: sp }] = await Promise.all([
      supabase.from("members").select("*").order("roll", { ascending: true, nullsFirst: false }).order("name"),
      supabase.from("fines").select("*, members(name)").order("date_issued", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("social_probation").select("*, members(name)").order("created_at", { ascending: false }),
    ]);
    setMembers(m ?? []);
    setFines(
      (f ?? []).map((fine: Fine & { members?: { name: string } }) => ({
        ...fine,
        member_name: fine.members?.name,
      }))
    );
    setAuditLogs(a ?? []);
    setSocialProbations(
      (sp ?? []).map((s: SocialProbation & { members?: { name: string } }) => ({
        ...s,
        member_name: s.members?.name,
      }))
    );
    setLoading(false);
  }

  async function autoEscalateOverdueFines() {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: overdue } = await supabase
      .from("fines")
      .select("id, fine_type, members(name)")
      .eq("status", "pending")
      .lt("created_at", twoWeeksAgo);

    if (!overdue || overdue.length === 0) return;

    const ids = (overdue as { id: string }[]).map((f) => f.id);
    await supabase.from("fines").update({ status: "upheld" }).in("id", ids);

    for (const fine of overdue as unknown as { id: string; fine_type: string; members?: { name: string } }[]) {
      await supabase.from("audit_logs").insert({
        admin_email: "system",
        action: "Auto-Escalated Fine",
        details: `${fine.members?.name ?? "Unknown"} — ${fine.fine_type} auto-escalated to "upheld" (pending > 2 weeks)`,
      });
    }

    await loadData();
  }

  async function autoDetectSocialProbation() {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().split("T")[0];

    const [{ data: upheldFines }, { data: autoSP }] = await Promise.all([
      supabase.from("fines").select("member_id, amount, created_at").eq("status", "upheld"),
      supabase.from("social_probation")
        .select("id, member_id")
        .eq("source", "auto")
        .eq("reason", "Outstanding Fines (§10-270)")
        .is("end_date", null),
    ]);

    if (!upheldFines) return;

    // Group upheld fines by member
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

    // §10-270: upheld fine older than 1 week OR total upheld > $20
    const qualifying = new Set<string>();
    for (const [memberId, data] of memberData) {
      if (data.totalOwed > 20 || data.oldestCreated < oneWeekAgo) qualifying.add(memberId);
    }

    const alreadyOn = new Set((autoSP ?? []).map((sp: { id: string; member_id: string }) => sp.member_id));
    const toAdd = [...qualifying].filter((id) => !alreadyOn.has(id));
    const toRemove = (autoSP ?? []).filter((sp: { id: string; member_id: string }) => !qualifying.has(sp.member_id)) as { id: string; member_id: string }[];

    if (toAdd.length === 0 && toRemove.length === 0) return;

    // Fetch names for logging
    const allIds = [...toAdd, ...toRemove.map((sp) => sp.member_id)];
    const { data: nameData } = await supabase.from("members").select("id, name").in("id", allIds);
    const nameMap = new Map((nameData ?? []).map((m: { id: string; name: string }) => [m.id, m.name]));

    for (const memberId of toAdd) {
      await supabase.from("social_probation").insert({
        member_id: memberId,
        reason: "Outstanding Fines (§10-270)",
        start_date: today,
        source: "auto",
      });
      await supabase.from("audit_logs").insert({
        admin_email: "system",
        action: "Auto Social Probation",
        details: `${nameMap.get(memberId) ?? "Unknown"} placed on social probation — outstanding fines per §10-270`,
      });
    }

    for (const sp of toRemove) {
      await supabase.from("social_probation").update({ end_date: today }).eq("id", sp.id);
      await supabase.from("audit_logs").insert({
        admin_email: "system",
        action: "Auto Social Probation Lifted",
        details: `${nameMap.get(sp.member_id) ?? "Unknown"} removed from social probation — fines resolved`,
      });
    }

    await loadData();
  }

  async function loadAdminUsers() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setAdminUsers(await res.json());
  }

  async function loadVenmoSettings() {
    const res = await fetch("/api/admin/settings");
    if (res.ok) {
      const data = await res.json();
      setVenmoForm({ venmo_handle: data.venmo_handle ?? "", venmo_url: data.venmo_url ?? "" });
    }
  }

  async function createAdminUser(e: React.FormEvent) {
    e.preventDefault();
    setNewUserSubmitting(true);
    setNewUserError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUserForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setNewUserError(data.error ?? "Failed to create user");
    } else {
      setNewUserForm({ email: "", password: "", role: "admin" });
      await loadAdminUsers();
    }
    setNewUserSubmitting(false);
  }

  async function removeAdminUser(userId: string) {
    if (!confirm("Remove this user? They will lose access immediately.")) return;
    await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    await loadAdminUsers();
  }

  async function transferOwnership(targetUserId: string, targetEmail: string) {
    if (!confirm(`Transfer ownership to ${targetEmail}? You will become an admin.`)) return;
    const res = await fetch("/api/admin/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId }),
    });
    if (res.ok) {
      setUserRole("admin");
      await loadAdminUsers();
    }
  }

  async function saveVenmo(e: React.FormEvent) {
    e.preventDefault();
    setVenmoSaving(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "venmo_handle", value: venmoForm.venmo_handle }),
    });
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "venmo_url", value: venmoForm.venmo_url }),
    });
    setVenmoSaving(false);
    setVenmoSaved(true);
    setTimeout(() => setVenmoSaved(false), 2500);
  }

  async function addSocialProbation(e: React.FormEvent) {
    e.preventDefault();
    if (!spSelectedMember) { setSpError("Select a member."); return; }
    setSpSubmitting(true);
    setSpError("");

    const { error } = await supabase.from("social_probation").insert({
      member_id: spSelectedMember.id,
      reason: spForm.reason,
      notes: spForm.notes || null,
      start_date: spForm.start_date,
      end_date: spForm.end_date || null,
      source: "manual",
    });

    if (error) {
      setSpError(error.message);
    } else {
      await supabase.from("audit_logs").insert({
        admin_email: adminEmail,
        action: "Added Social Probation",
        details: `${spSelectedMember.name} — ${spForm.reason}`,
      });
      setSpSelectedMember(null);
      setSpMemberSearch("");
      setSpForm({ reason: "Outstanding Fines (§10-270)", notes: "", start_date: new Date().toISOString().split("T")[0], end_date: "" });
      await loadData();
    }
    setSpSubmitting(false);
  }

  async function removeSocialProbation(id: string, memberName: string, reason: string) {
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("social_probation").update({ end_date: today }).eq("id", id);
    await supabase.from("audit_logs").insert({
      admin_email: adminEmail,
      action: "Removed Social Probation",
      details: `${memberName} — ${reason} lifted`,
    });
    await loadData();
  }

  async function submitOutstandingFine(e: React.FormEvent) {
    e.preventDefault();
    if (!outSelectedMember) { setOutError("Select a member."); return; }
    setOutSubmitting(true);
    setOutError("");

    const { error } = await supabase.from("fines").insert({
      member_id: outSelectedMember.id,
      fine_type: outForm.fine_type,
      description: outForm.description,
      amount: outForm.amount ? parseFloat(outForm.amount) : null,
      status: "upheld",
      term: outForm.term,
      date_issued: outForm.date_issued,
      notes: outForm.notes || null,
    });

    if (error) {
      setOutError(error.message);
      setOutSubmitting(false);
      return;
    }

    await supabase.from("audit_logs").insert({
      admin_email: adminEmail,
      action: "Issued Outstanding Fine",
      details: `${outSelectedMember.name} — ${outForm.fine_type}${outForm.amount ? ` $${outForm.amount}` : ""} (${outForm.term})`,
    });

    if (outForm.place_on_soc_pro) {
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("social_probation").insert({
        member_id: outSelectedMember.id,
        reason: "Outstanding Fines (§10-270)",
        start_date: today,
        source: "manual",
        notes: outForm.notes || null,
      });
      await supabase.from("audit_logs").insert({
        admin_email: adminEmail,
        action: "Added Social Probation",
        details: `${outSelectedMember.name} — Outstanding Fines (§10-270) (manual, issued with fine)`,
      });
    }

    setOutSelectedMember(null);
    setOutMemberSearch("");
    setOutForm({
      fine_type: "General Misconduct (§11-020)",
      description: "",
      amount: "",
      term: getCurrentTerm(),
      date_issued: new Date().toISOString().split("T")[0],
      notes: "",
      place_on_soc_pro: false,
    });
    await loadData();
    setOutSubmitting(false);
  }

  async function log(action: string, details: string) {
    await supabase.from("audit_logs").insert({ admin_email: adminEmail, action, details });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  async function submitFine(e: React.FormEvent) {
    e.preventDefault();
    if (selectedMembers.length === 0) { setFineError("Select at least one member."); return; }
    setFineSubmitting(true);
    setFineError("");

    const rows = selectedMembers.map((m) => ({
      member_id: m.id,
      fine_type: fineForm.fine_type,
      description: fineForm.description,
      amount: fineForm.amount ? parseFloat(fineForm.amount) : null,
      status: "pending",
      term: fineForm.term,
      date_issued: fineForm.date_issued,
      notes: fineForm.notes || null,
    }));

    const { error } = await supabase.from("fines").insert(rows);

    if (error) {
      setFineError(error.message);
    } else {
      const names = selectedMembers.map((m) => m.name).join(", ");
      await log("Issued Fine", `${fineForm.fine_type} against ${names} — "${fineForm.description}" (${fineForm.term}${fineForm.amount ? `, $${fineForm.amount}` : ""})`);
      setFineForm({
        fine_type: "General Misconduct (§11-020)",
        description: "",
        amount: "",
        term: getCurrentTerm(),
        date_issued: new Date().toISOString().split("T")[0],
        notes: "",
      });
      setSelectedMembers([]);
      setMemberSearch("");
      await loadData();
    }
    setFineSubmitting(false);
  }

  async function updateFineStatus(id: string, status: FineStatus) {
    const fine = fines.find((f) => f.id === id);
    const dateResolved = ["paid", "dismissed", "labor"].includes(status)
      ? new Date().toISOString().split("T")[0]
      : null;

    await supabase
      .from("fines")
      .update({ status, date_resolved: dateResolved })
      .eq("id", id);

    if (fine) {
      await log("Updated Fine Status", `${fine.member_name ?? "Unknown"} — ${fine.fine_type} changed to "${status}"`);

      if (status === "paid") {
        await fetch("/api/admin/export-fine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            member_name: fine.member_name,
            fine_type: fine.fine_type,
            description: fine.description,
            amount: fine.amount,
            date_resolved: dateResolved,
          }),
        });
      }
    }
    await loadData();
  }

  async function deleteFine(id: string) {
    if (!confirm("Delete this fine?")) return;
    const fine = fines.find((f) => f.id === id);
    await supabase.from("fines").delete().eq("id", id);
    if (fine) {
      await log("Deleted Fine", `${fine.member_name ?? "Unknown"} — ${fine.fine_type} (${fine.term})`);
    }
    await loadData();
  }

  async function submitMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberSubmitting(true);
    setMemberError("");

    const { error } = await supabase.from("members").insert({
      name: memberForm.name.trim(),
      status: memberForm.status,
      roll: memberForm.roll ? parseInt(memberForm.roll) : null,
    });

    if (error) {
      setMemberError(error.message);
    } else {
      await log("Added Member", `${memberForm.name.trim()} (${memberForm.status})${memberForm.roll ? ` — Roll ${memberForm.roll}` : ""}`);
      setMemberForm({ name: "", status: "active", roll: "" });
      await loadData();
    }
    setMemberSubmitting(false);
  }

  async function updateMemberStatus(id: string, status: Member["status"]) {
    const member = members.find((m) => m.id === id);
    await supabase.from("members").update({ status }).eq("id", id);
    if (member) {
      await log("Updated Member Status", `${member.name} changed from "${member.status}" to "${status}"`);
    }
    await loadData();
  }

  async function deleteMember(id: string) {
    if (!confirm("Delete this member and all their fines?")) return;
    const member = members.find((m) => m.id === id);
    await supabase.from("fines").delete().eq("member_id", id);
    await supabase.from("members").delete().eq("id", id);
    if (member) {
      await log("Deleted Member", `${member.name} (${member.status})`);
    }
    await loadData();
  }

  const filteredFines = fines.filter((f) => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterMember !== "all" && f.member_id !== filterMember) return false;
    return true;
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');

        :root {
          --bg: #0D1117;
          --surface: #161B22;
          --surface-2: #1C2128;
          --border: #30363D;
          --border-light: #21262D;
          --gold: #CFB53B;
          --gold-dim: #8A7520;
          --text: #E6EDF3;
          --text-muted: #8B949E;
          --text-dim: #484F58;
          --red: #F87171;
        }

        .adm-page {
          min-height: 100vh;
          background: var(--bg);
          font-family: 'IBM Plex Sans', sans-serif;
          color: var(--text);
          overflow-x: hidden;
        }

        .adm-header {
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 60px;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .adm-header-left { display: flex; align-items: center; gap: 14px; }

        .adm-gold-bar {
          width: 3px;
          height: 30px;
          background: var(--gold);
          border-radius: 2px;
          flex-shrink: 0;
        }

        .adm-title {
          font-family: 'Playfair Display', serif;
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
          line-height: 1.1;
        }

        .adm-subtitle {
          font-size: 10px;
          color: var(--text-dim);
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-family: 'IBM Plex Mono', monospace;
          margin-top: 1px;
        }

        .adm-signout {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-family: 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .adm-signout:hover { border-color: var(--gold); color: var(--gold); }

        .adm-body {
          max-width: 1000px;
          margin: 0 auto;
          padding: 32px 24px 64px;
        }

        .adm-tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          margin-bottom: 28px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .adm-tabs::-webkit-scrollbar { display: none; }

        .adm-tab {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          padding: 10px 20px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-family: 'IBM Plex Mono', monospace;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .adm-tab:hover { color: var(--text); }
        .adm-tab.active { color: var(--gold); border-bottom-color: var(--gold); }

        .adm-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }

        .adm-card-header {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }

        .adm-card-title {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-muted);
          font-family: 'IBM Plex Mono', monospace;
        }

        .adm-card-body { padding: 20px; cursor: default; }

        .adm-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 6px;
          font-family: 'IBM Plex Mono', monospace;
        }
        .adm-req { color: var(--gold); }
        .adm-opt { color: var(--text-dim); font-weight: 400; }

        .adm-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 9px 12px;
          font-size: 13px;
          font-family: 'IBM Plex Sans', sans-serif;
          color: var(--text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          -webkit-appearance: none;
        }
        .adm-input::placeholder { color: var(--text-dim); }
        .adm-input:focus {
          border-color: var(--gold-dim);
          box-shadow: 0 0 0 3px rgba(207,181,59,0.08);
        }
        .adm-input option { background: #1C2128; }

        .adm-member-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .adm-member-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(207,181,59,0.12);
          border: 1px solid rgba(207,181,59,0.3);
          border-radius: 5px;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 500;
          color: var(--gold);
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .adm-member-tag-remove {
          background: transparent;
          border: none;
          color: var(--gold-dim);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0;
          display: flex;
          align-items: center;
          transition: color 0.1s;
        }
        .adm-member-tag-remove:hover { color: var(--red); }

        .adm-suggestions {
          position: absolute;
          top: calc(100% + 4px);
          left: 0; right: 0;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 60;
          list-style: none;
          margin: 0;
          padding: 0;
          max-height: 200px;
          overflow-y: auto;
        }

        .adm-suggestion-btn {
          width: 100%;
          text-align: left;
          padding: 9px 14px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-light);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: var(--text);
          font-size: 13px;
          font-family: 'IBM Plex Sans', sans-serif;
          transition: background 0.1s;
        }
        .adm-suggestion-btn:last-child { border-bottom: none; }
        .adm-suggestion-btn:hover { background: rgba(207,181,59,0.06); }
        .adm-suggestion-name { font-weight: 500; }
        .adm-suggestion-status {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: capitalize;
          font-family: 'IBM Plex Mono', monospace;
        }

        .adm-btn {
          background: var(--gold);
          color: #0D1117;
          border: none;
          padding: 9px 20px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.3px;
          font-family: 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .adm-btn:hover { opacity: 0.85; }
        .adm-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .adm-fine-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-light);
          border-left: 3px solid transparent;
          transition: background 0.1s;
        }
        .adm-fine-row:last-child { border-bottom: none; }
        .adm-fine-row:hover { background: rgba(255,255,255,0.015); }

        .adm-fine-member { font-weight: 600; font-size: 14px; color: var(--text); }
        .adm-fine-type { font-size: 12px; color: var(--text-muted); font-family: 'IBM Plex Mono', monospace; }
        .adm-fine-desc { font-size: 13px; color: var(--text); margin-top: 3px; }
        .adm-fine-notes { font-size: 11px; color: var(--gold-dim); font-style: italic; margin-top: 3px; }
        .adm-fine-meta { font-size: 11px; color: var(--text-dim); margin-top: 5px; font-family: 'IBM Plex Mono', monospace; }

        .adm-status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          font-family: 'IBM Plex Mono', monospace;
          border-width: 1px;
          border-style: solid;
          white-space: nowrap;
        }

        .adm-status-select {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 11px;
          color: var(--text-muted);
          font-family: 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          outline: none;
          transition: border-color 0.15s;
        }
        .adm-status-select:focus { border-color: var(--gold-dim); }
        .adm-status-select option { background: #1C2128; }

        .adm-delete-btn {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 11px;
          cursor: pointer;
          font-family: 'IBM Plex Sans', sans-serif;
          transition: color 0.15s;
          padding: 0;
        }
        .adm-delete-btn:hover { color: var(--red); }

        .adm-filters { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }

        .adm-table { width: 100%; border-collapse: collapse; }
        .adm-table thead tr { border-bottom: 1px solid var(--border); }
        .adm-table th {
          text-align: left;
          padding: 11px 20px;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          background: var(--surface-2);
        }
        .adm-table td {
          padding: 12px 20px;
          border-bottom: 1px solid var(--border-light);
          font-size: 13px;
          color: var(--text);
          cursor: default;
          user-select: none;
        }
        .adm-table tbody tr:last-child td { border-bottom: none; }
        .adm-table tbody tr:hover td { background: rgba(255,255,255,0.012); }
        .adm-table th { cursor: default; user-select: none; }

        .adm-member-block {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 14px;
        }
        .adm-member-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
        }
        .adm-member-block-name { font-weight: 600; font-size: 14px; color: var(--text); }

        .adm-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-bottom: 20px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
        }

        .adm-error { font-size: 12px; color: var(--red); margin-top: 4px; }
        .adm-loading { color: var(--text-muted); font-size: 13px; padding: 64px 0; text-align: center; font-style: italic; }
        .adm-empty { color: var(--text-dim); font-size: 13px; text-align: center; padding: 40px 0; }

        .adm-view-only-banner {
          background: rgba(207,181,59,0.08);
          border: 1px solid rgba(207,181,59,0.25);
          border-radius: 8px;
          padding: 10px 18px;
          margin-bottom: 20px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--gold);
          font-family: 'IBM Plex Mono', monospace;
          text-align: center;
        }
      `}</style>

      <div className="adm-page">
        {/* Header */}
        <header className="adm-header">
          <div className="adm-header-left">
            <div className="adm-gold-bar" />
            <div>
              <div className="adm-title">JP Admin</div>
              <div className="adm-subtitle">Acacia · Oregon State</div>
            </div>
            <a
              href={`mailto:bergedillon@gmail.com?subject=JP Admin Bug Report&body=Reported by: ${adminEmail}%0A%0ADescribe the bug:%0A`}
              style={{ marginLeft: 8, fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px", textDecoration: "none", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
            >
              bugs?
            </a>
          </div>
          <button onClick={signOut} className="adm-signout">Sign out</button>
        </header>

        <div className="adm-body">
          {userRole === "admin" && (
            <div className="adm-view-only-banner">View Only — Contact JP Chair to make changes</div>
          )}
          {/* Tabs */}
          <div className="adm-tabs">
            {(["fines", "outstanding", "members", "soc pro", "audit"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`adm-tab${tab === t ? " active" : ""}`}
              >
                {t}
              </button>
            ))}
            {userRole === "owner" && (
              <button
                className={`adm-tab${tab === "transition" ? " active" : ""}`}
                onClick={() => { setTab("transition"); loadAdminUsers(); loadVenmoSettings(); }}
              >
                Transition
              </button>
            )}
          </div>

          {loading ? (
            <p className="adm-loading">Loading records…</p>
          ) : (
            <>
              {/* FINES TAB */}
              {tab === "fines" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* Issue Fine Form — owner only */}
                  {userRole === "owner" && <div className="adm-card">
                    <div className="adm-card-header">
                      <span className="adm-card-title">Issue Fine</span>
                    </div>
                    <div className="adm-card-body">
                      <form onSubmit={submitFine} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                        <div style={{ position: "relative", gridColumn: "span 2" }}>
                          <label className="adm-label">
                            Members <span className="adm-req">*</span>
                            {selectedMembers.length > 0 && (
                              <span style={{ color: "var(--gold)", marginLeft: 6, fontWeight: 600 }}>
                                {selectedMembers.length} selected
                              </span>
                            )}
                          </label>
                          <input
                            type="text"
                            value={memberSearch}
                            onChange={(e) => {
                              setMemberSearch(e.target.value);
                              setShowMemberSuggestions(true);
                            }}
                            onFocus={() => setShowMemberSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowMemberSuggestions(false), 150)}
                            placeholder="Search and add members…"
                            autoComplete="off"
                            className="adm-input"
                          />
                          {showMemberSuggestions && memberSearch.trim() && (
                            <ul className="adm-suggestions">
                              {members
                                .filter((m) =>
                                  (m.status === "active" || m.status === "pledge") &&
                                  m.name.toLowerCase().includes(memberSearch.toLowerCase()) &&
                                  !selectedMembers.find((s) => s.id === m.id)
                                )
                                .map((m) => (
                                  <li key={m.id}>
                                    <button
                                      type="button"
                                      onMouseDown={() => {
                                        setSelectedMembers((prev) => [...prev, m]);
                                        setMemberSearch("");
                                        setShowMemberSuggestions(false);
                                      }}
                                      className="adm-suggestion-btn"
                                    >
                                      <span className="adm-suggestion-name">{m.name}</span>
                                      <span className="adm-suggestion-status">{m.status}</span>
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          )}
                          {selectedMembers.length > 0 && (
                            <div className="adm-member-tags">
                              {selectedMembers.map((m) => (
                                <span key={m.id} className="adm-member-tag">
                                  {m.name}
                                  <button
                                    type="button"
                                    className="adm-member-tag-remove"
                                    onClick={() => setSelectedMembers((prev) => prev.filter((s) => s.id !== m.id))}
                                  >×</button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="adm-label">Fine Type <span className="adm-req">*</span></label>
                          <select
                            value={fineForm.fine_type}
                            onChange={(e) => {
                              const type = e.target.value as FineType;
                              setFineForm({ ...fineForm, fine_type: type, description: FINE_DESCRIPTIONS[type] ?? "" });
                            }}
                            className="adm-input"
                          >
                            {FINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <div style={{ gridColumn: "span 2" }}>
                          <label className="adm-label">Description <span className="adm-req">*</span></label>
                          <input
                            type="text"
                            value={fineForm.description}
                            onChange={(e) => setFineForm({ ...fineForm, description: e.target.value })}
                            required
                            placeholder="Brief description of the offense"
                            className="adm-input"
                          />
                        </div>

                        <div>
                          <label className="adm-label">Amount ($) <span className="adm-opt">optional</span></label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={fineForm.amount}
                            onChange={(e) => setFineForm({ ...fineForm, amount: e.target.value })}
                            placeholder="0.00"
                            className="adm-input"
                          />
                        </div>

                        <div>
                          <label className="adm-label">Term <span className="adm-req">*</span></label>
                          <select
                            value={fineForm.term}
                            onChange={(e) => setFineForm({ ...fineForm, term: e.target.value })}
                            required
                            className="adm-input"
                          >
                            {getTermOptions().map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="adm-label">Date Issued <span className="adm-req">*</span></label>
                          <input
                            type="date"
                            value={fineForm.date_issued}
                            onChange={(e) => setFineForm({ ...fineForm, date_issued: e.target.value })}
                            required
                            className="adm-input"
                          />
                        </div>

                        <div>
                          <label className="adm-label">Notes <span className="adm-opt">optional</span></label>
                          <input
                            type="text"
                            value={fineForm.notes}
                            onChange={(e) => setFineForm({ ...fineForm, notes: e.target.value })}
                            placeholder="Any additional context"
                            className="adm-input"
                          />
                        </div>

                        {fineError && (
                          <p className="adm-error" style={{ gridColumn: "span 2" }}>{fineError}</p>
                        )}

                        <div style={{ gridColumn: "span 2" }}>
                          {userRole === "owner" && (
                            <button type="submit" disabled={fineSubmitting} className="adm-btn">
                              {fineSubmitting ? "Issuing…" : "Issue Fine"}
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>}

                  {/* Filters */}
                  <div className="adm-filters">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as FineStatus | "all")}
                      className="adm-input"
                      style={{ width: "auto" }}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="upheld">Upheld</option>
                      <option value="dismissed">Dismissed</option>
                      <option value="paid">Paid</option>
                      <option value="labor">Labor</option>
                    </select>
                    <select
                      value={filterMember}
                      onChange={(e) => setFilterMember(e.target.value)}
                      className="adm-input"
                      style={{ width: "auto" }}
                    >
                      <option value="all">All members</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                      {filteredFines.length} fine{filteredFines.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Fines List */}
                  <div className="adm-card">
                    {filteredFines.length === 0 ? (
                      <p className="adm-empty">No fines found.</p>
                    ) : (
                      filteredFines.map((fine) => {
                        const sc = STATUS_COLORS[fine.status] ?? { bg: "transparent", color: "#8B949E", border: "#30363D" };
                        return (
                          <div
                            key={fine.id}
                            className="adm-fine-row"
                            style={{ borderLeftColor: sc.color }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span className="adm-fine-member">{fine.member_name}</span>
                                <span style={{ color: "var(--text-dim)" }}>·</span>
                                <span className="adm-fine-type">{fine.fine_type}</span>
                              </div>
                              <p className="adm-fine-desc">{fine.description}</p>
                              {fine.notes && <p className="adm-fine-notes">{fine.notes}</p>}
                              <p className="adm-fine-meta">
                                {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}
                                {fine.amount != null && ` · $${fine.amount.toFixed(2)}`}
                              </p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                              <span
                                className="adm-status-badge"
                                style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
                              >
                                {fine.status}
                              </span>
                              {userRole === "owner" ? (
                                <select
                                  value={fine.status}
                                  onChange={(e) => updateFineStatus(fine.id, e.target.value as FineStatus)}
                                  className="adm-status-select"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="upheld">Upheld</option>
                                  <option value="dismissed">Dismissed</option>
                                  <option value="paid">Paid</option>
                                  <option value="labor">Labor</option>
                                </select>
                              ) : (
                                <span className="adm-status-badge" style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{fine.status}</span>
                              )}
                              {userRole === "owner" && (
                                <button onClick={() => deleteFine(fine.id)} className="adm-delete-btn">Delete</button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* OUTSTANDING TAB */}
              {tab === "outstanding" && (() => {
                const outstandingFines = fines.filter((f) => f.status === "pending" || f.status === "upheld");
                const byMember = members
                  .map((m) => {
                    const mFines = outstandingFines.filter((f) => f.member_id === m.id);
                    const totalOwed = mFines
                      .filter((f) => f.status === "upheld")
                      .reduce((sum, f) => sum + (f.amount ?? 0), 0);
                    return { member: m, fines: mFines, totalOwed };
                  })
                  .filter((g) => g.fines.length > 0)
                  .sort((a, b) => b.totalOwed - a.totalOwed);

                const grandTotal = byMember.reduce((sum, g) => sum + g.totalOwed, 0);

                const outSuggestions = members
                  .filter((m) => ["active", "pledge"].includes(m.status) && m.name.toLowerCase().includes(outMemberSearch.toLowerCase()))
                  .slice(0, 8);

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Add Outstanding Fine Form — owner only */}
                    {userRole === "owner" && <div className="adm-card">
                      <div className="adm-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="adm-card-title">Add Outstanding Fine</span>
                        <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>issued as upheld</span>
                      </div>
                      <div className="adm-card-body">
                        <form onSubmit={submitOutstandingFine} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          {/* Member picker */}
                          <div style={{ position: "relative", gridColumn: "span 2" }}>
                            <label className="adm-label">Member <span className="adm-req">*</span></label>
                            {outSelectedMember ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ background: "rgba(207,181,59,0.15)", color: "var(--gold)", border: "1px solid rgba(207,181,59,0.3)", borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 500 }}>
                                  {outSelectedMember.name}
                                </span>
                                <button type="button" onClick={() => { setOutSelectedMember(null); setOutMemberSearch(""); }} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                              </div>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={outMemberSearch}
                                  onChange={(e) => { setOutMemberSearch(e.target.value); setShowOutSuggestions(true); }}
                                  onFocus={() => setShowOutSuggestions(true)}
                                  onBlur={() => setTimeout(() => setShowOutSuggestions(false), 150)}
                                  placeholder="Type a name…"
                                  className="adm-input"
                                  autoComplete="off"
                                />
                                {showOutSuggestions && outMemberSearch && outSuggestions.length > 0 && (
                                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 10, marginTop: 2, overflow: "hidden" }}>
                                    {outSuggestions.map((m) => (
                                      <div key={m.id} onMouseDown={() => { setOutSelectedMember(m); setOutMemberSearch(""); setShowOutSuggestions(false); }} style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13 }} className="adm-suggestion">
                                        {m.name}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <label className="adm-label">Fine Type <span className="adm-req">*</span></label>
                            <select value={outForm.fine_type} onChange={(e) => { const type = e.target.value as FineType; setOutForm({ ...outForm, fine_type: type, description: FINE_DESCRIPTIONS[type] ?? "" }); }} className="adm-input" style={{ width: "100%" }}>
                              {FINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <label className="adm-label">Description <span className="adm-req">*</span></label>
                            <input type="text" value={outForm.description} onChange={(e) => setOutForm({ ...outForm, description: e.target.value })} required placeholder="Brief description…" className="adm-input" />
                          </div>

                          <div>
                            <label className="adm-label">Amount ($)</label>
                            <input type="number" min="0" step="0.01" value={outForm.amount} onChange={(e) => setOutForm({ ...outForm, amount: e.target.value })} placeholder="0.00" className="adm-input" />
                          </div>
                          <div>
                            <label className="adm-label">Term <span className="adm-req">*</span></label>
                            <select
                              value={outForm.term}
                              onChange={(e) => setOutForm({ ...outForm, term: e.target.value })}
                              required
                              className="adm-input"
                            >
                              {getTermOptions().map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="adm-label">Date Issued</label>
                            <input type="date" value={outForm.date_issued} onChange={(e) => setOutForm({ ...outForm, date_issued: e.target.value })} className="adm-input" />
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <label className="adm-label">Notes</label>
                            <input type="text" value={outForm.notes} onChange={(e) => setOutForm({ ...outForm, notes: e.target.value })} placeholder="Additional context…" className="adm-input" />
                          </div>

                          <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: 10 }}>
                            <input
                              type="checkbox"
                              id="out-soc-pro"
                              checked={outForm.place_on_soc_pro}
                              onChange={(e) => setOutForm({ ...outForm, place_on_soc_pro: e.target.checked })}
                              style={{ accentColor: "var(--gold)", width: 15, height: 15, cursor: "pointer" }}
                            />
                            <label htmlFor="out-soc-pro" style={{ fontSize: 13, color: "var(--text-muted)", cursor: "pointer", userSelect: "none" }}>
                              Place on social probation
                            </label>
                          </div>

                          {outError && <p className="adm-error" style={{ gridColumn: "span 2" }}>{outError}</p>}
                          {userRole === "owner" && (
                            <button type="submit" disabled={outSubmitting} className="adm-btn">
                              {outSubmitting ? "Adding…" : "Add Outstanding Fine"}
                            </button>
                          )}
                        </form>
                      </div>
                    </div>}

                    <div className="adm-summary">
                      <span style={{ color: "var(--text-muted)" }}>
                        {outstandingFines.length} outstanding fine{outstandingFines.length !== 1 ? "s" : ""} · {byMember.length} member{byMember.length !== 1 ? "s" : ""}
                      </span>
                      {grandTotal > 0 && (
                        <span style={{ color: "var(--red)", fontWeight: 600 }}>
                          ${grandTotal.toFixed(2)} total owed
                        </span>
                      )}
                    </div>

                    {byMember.length === 0 ? (
                      <p className="adm-empty">No outstanding fines.</p>
                    ) : (
                      byMember.map(({ member, fines: mFines, totalOwed }) => (
                        <div key={member.id} className="adm-member-block">
                          <div className="adm-member-block-header" style={{ userSelect: "none", cursor: "default" }}>
                            <span className="adm-member-block-name">{member.name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "capitalize", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.5px" }}>
                                {member.status}
                              </span>
                              {totalOwed > 0 && (
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: "var(--red)" }}>
                                  ${totalOwed.toFixed(2)} owed
                                </span>
                              )}
                            </div>
                          </div>
                          {mFines.map((fine) => {
                            const sc = STATUS_COLORS[fine.status] ?? { bg: "transparent", color: "#8B949E", border: "#30363D" };
                            return (
                              <div key={fine.id} className="adm-fine-row" style={{ borderLeftColor: sc.color }}>
                                <div style={{ flex: 1, minWidth: 0, userSelect: "none", cursor: "default" }}>
                                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{fine.fine_type}</p>
                                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{fine.description}</p>
                                  {fine.notes && <p className="adm-fine-notes">{fine.notes}</p>}
                                  <p className="adm-fine-meta">
                                    {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}
                                    {fine.amount != null && ` · $${fine.amount.toFixed(2)}`}
                                  </p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                                  <span className="adm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                                    {fine.status}
                                  </span>
                                  {userRole === "owner" ? (
                                    <select
                                      value={fine.status}
                                      onChange={(e) => updateFineStatus(fine.id, e.target.value as FineStatus)}
                                      className="adm-status-select"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="upheld">Upheld</option>
                                      <option value="dismissed">Dismissed</option>
                                      <option value="paid">Paid</option>
                                      <option value="labor">Labor</option>
                                    </select>
                                  ) : (
                                    <span className="adm-status-badge" style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{fine.status}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}

              {/* MEMBERS TAB */}
              {tab === "members" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {userRole === "owner" && <div className="adm-card">
                    <div className="adm-card-header">
                      <span className="adm-card-title">Add Member</span>
                    </div>
                    <div className="adm-card-body">
                      <form onSubmit={submitMember} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <label className="adm-label">Full Name</label>
                          <input
                            type="text"
                            value={memberForm.name}
                            onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                            required
                            placeholder="First Last"
                            className="adm-input"
                          />
                        </div>
                        <div>
                          <label className="adm-label">Roll #</label>
                          <input
                            type="number"
                            value={memberForm.roll}
                            onChange={(e) => setMemberForm({ ...memberForm, roll: e.target.value })}
                            placeholder="e.g. 1391"
                            className="adm-input"
                            style={{ width: 120 }}
                          />
                        </div>
                        <div>
                          <label className="adm-label">Status</label>
                          <select
                            value={memberForm.status}
                            onChange={(e) => setMemberForm({ ...memberForm, status: e.target.value as Member["status"] })}
                            className="adm-input"
                            style={{ width: "auto" }}
                          >
                            <option value="active">Active</option>
                            <option value="pledge">Pledge</option>
                            <option value="alumni">Alumni</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                        {memberError && <p className="adm-error">{memberError}</p>}
                        {userRole === "owner" && (
                          <button type="submit" disabled={memberSubmitting} className="adm-btn">
                            {memberSubmitting ? "Adding…" : "Add Member"}
                          </button>
                        )}
                      </form>
                    </div>
                  </div>}

                  <div className="adm-card">
                    {members.length === 0 ? (
                      <p className="adm-empty">No members yet.</p>
                    ) : (
                      <table className="adm-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Roll #</th>
                            <th>Status</th>
                            <th>Fines</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((m) => {
                            const memberFines = fines.filter((f) => f.member_id === m.id);
                            const open = memberFines.filter((f) => ["pending", "upheld"].includes(f.status)).length;
                            return (
                              <tr key={m.id}>
                                <td style={{ fontWeight: 500 }}>{m.name}</td>
                                <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: m.roll ? "var(--gold)" : "var(--text-dim)" }}>
                                  {m.roll ?? "—"}
                                </td>
                                <td>
                                  {userRole === "owner" ? (
                                    <select
                                      value={m.status}
                                      onChange={(e) => updateMemberStatus(m.id, e.target.value as Member["status"])}
                                      className="adm-status-select"
                                    >
                                      <option value="active">Active</option>
                                      <option value="pledge">Pledge</option>
                                      <option value="alumni">Alumni</option>
                                      <option value="inactive">Inactive</option>
                                    </select>
                                  ) : (
                                    <span className="adm-status-badge" style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{m.status}</span>
                                  )}
                                </td>
                                <td>
                                  {open > 0 ? (
                                    <span style={{ color: "var(--red)", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                                      {open} open
                                    </span>
                                  ) : (
                                    <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>
                                  )}
                                  {memberFines.length > 0 && (
                                    <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 6 }}>
                                      ({memberFines.length} total)
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  {userRole === "owner" && (
                                    <button onClick={() => deleteMember(m.id)} className="adm-delete-btn">Delete</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* SOCIAL PROBATION TAB */}
              {tab === "soc pro" && (() => {
                const activeSP = socialProbations.filter((sp) => !sp.end_date);
                const spMemberSuggestions = members
                  .filter((m) => ["active", "pledge"].includes(m.status) && m.name.toLowerCase().includes(spMemberSearch.toLowerCase()))
                  .slice(0, 8);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    {/* Add form — owner only */}
                    {userRole === "owner" && <div className="adm-card">
                      <div className="adm-card-header">
                        <span className="adm-card-title">Add to Social Probation</span>
                      </div>
                      <div className="adm-card-body">
                        <form onSubmit={addSocialProbation} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div style={{ position: "relative", gridColumn: "span 2" }}>
                            <label className="adm-label">Member <span className="adm-req">*</span></label>
                            {spSelectedMember ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ background: "rgba(207,181,59,0.15)", color: "var(--gold)", border: "1px solid rgba(207,181,59,0.3)", borderRadius: 6, padding: "4px 10px", fontSize: 13, fontWeight: 500 }}>
                                  {spSelectedMember.name}
                                </span>
                                <button type="button" onClick={() => { setSpSelectedMember(null); setSpMemberSearch(""); }} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                              </div>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={spMemberSearch}
                                  onChange={(e) => { setSpMemberSearch(e.target.value); setShowSpSuggestions(true); }}
                                  onFocus={() => setShowSpSuggestions(true)}
                                  onBlur={() => setTimeout(() => setShowSpSuggestions(false), 150)}
                                  placeholder="Type a name…"
                                  className="adm-input"
                                  autoComplete="off"
                                />
                                {showSpSuggestions && spMemberSearch && spMemberSuggestions.length > 0 && (
                                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, zIndex: 10, marginTop: 2, overflow: "hidden" }}>
                                    {spMemberSuggestions.map((m) => (
                                      <div key={m.id} onMouseDown={() => { setSpSelectedMember(m); setSpMemberSearch(""); setShowSpSuggestions(false); }} style={{ padding: "8px 14px", cursor: "pointer", fontSize: 13 }} className="adm-suggestion">
                                        {m.name}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <label className="adm-label">Reason <span className="adm-req">*</span></label>
                            <select value={spForm.reason} onChange={(e) => setSpForm({ ...spForm, reason: e.target.value as SocialProbationReason })} className="adm-input" style={{ width: "100%" }}>
                              {SP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="adm-label">Start Date</label>
                            <input type="date" value={spForm.start_date} onChange={(e) => setSpForm({ ...spForm, start_date: e.target.value })} className="adm-input" />
                          </div>
                          <div>
                            <label className="adm-label">End Date <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
                            <input type="date" value={spForm.end_date} onChange={(e) => setSpForm({ ...spForm, end_date: e.target.value })} className="adm-input" />
                          </div>

                          <div style={{ gridColumn: "span 2" }}>
                            <label className="adm-label">Notes <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
                            <input type="text" value={spForm.notes} onChange={(e) => setSpForm({ ...spForm, notes: e.target.value })} placeholder="Additional context…" className="adm-input" />
                          </div>

                          {spError && <p className="adm-error" style={{ gridColumn: "span 2" }}>{spError}</p>}
                          {userRole === "owner" && (
                            <button type="submit" disabled={spSubmitting} className="adm-btn">
                              {spSubmitting ? "Adding…" : "Add to Social Probation"}
                            </button>
                          )}
                        </form>
                      </div>
                    </div>}

                    {/* Active list */}
                    <div className="adm-card">
                      <div className="adm-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="adm-card-title">Currently on Social Probation</span>
                        <span style={{ color: activeSP.length > 0 ? "var(--red)" : "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600 }}>
                          {activeSP.length} active
                        </span>
                      </div>
                      {activeSP.length === 0 ? (
                        <p className="adm-empty">No members on social probation.</p>
                      ) : (
                        <table className="adm-table">
                          <thead>
                            <tr>
                              <th>Member</th>
                              <th>Reason</th>
                              <th>Since</th>
                              <th>Source</th>
                              <th>Notes</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {activeSP.map((sp) => (
                              <tr key={sp.id}>
                                <td style={{ fontWeight: 600 }}>{sp.member_name ?? "Unknown"}</td>
                                <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{sp.reason}</td>
                                <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, whiteSpace: "nowrap" }}>{sp.start_date}</td>
                                <td>
                                  <span style={{
                                    fontSize: 11,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    background: sp.source === "auto" ? "rgba(251,191,36,0.1)" : "rgba(96,165,250,0.1)",
                                    color: sp.source === "auto" ? "#FCD34D" : "#60A5FA",
                                    border: `1px solid ${sp.source === "auto" ? "rgba(251,191,36,0.3)" : "rgba(96,165,250,0.3)"}`,
                                  }}>
                                    {sp.source}
                                  </span>
                                </td>
                                <td style={{ fontSize: 12, color: "var(--text-dim)" }}>{sp.notes ?? "—"}</td>
                                <td style={{ textAlign: "right" }}>
                                  {userRole === "owner" && (
                                    <button onClick={() => removeSocialProbation(sp.id, sp.member_name ?? "Unknown", sp.reason)} className="adm-delete-btn">
                                      Lift
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* AUDIT LOG TAB */}
              {tab === "audit" && (
                <div className="adm-card">
                  {auditLogs.length === 0 ? (
                    <p className="adm-empty">No actions recorded yet.</p>
                  ) : (
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Admin</th>
                          <th>Action</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                              {new Date(log.created_at).toLocaleDateString()}{" "}
                              <span style={{ color: "var(--text-dim)" }}>
                                {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{log.admin_email}</td>
                            <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{log.action}</td>
                            <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{log.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* SETTINGS TAB */}
              {tab === "transition" && userRole === "owner" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                  {/* User Management */}
                  <div className="adm-card">
                    <div className="adm-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="adm-card-title">Admin Users</span>
                    </div>
                    <div className="adm-card-body">
                      <table className="adm-table" style={{ marginBottom: 24 }}>
                        <thead>
                          <tr>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Added</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map((u) => (
                            <tr key={u.user_id}>
                              <td style={{ fontWeight: 500 }}>{u.email}</td>
                              <td>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const,
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  color: u.role === "owner" ? "var(--gold)" : "var(--text-muted)",
                                }}>
                                  {u.role}
                                </span>
                              </td>
                              <td style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                                {new Date(u.created_at).toLocaleDateString()}
                              </td>
                              <td style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                {u.role === "admin" && (
                                  <button
                                    onClick={() => transferOwnership(u.user_id, u.email)}
                                    style={{ background: "rgba(207,181,59,0.1)", border: "1px solid rgba(207,181,59,0.3)", color: "var(--gold)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}
                                  >
                                    Transfer Ownership
                                  </button>
                                )}
                                <button onClick={() => removeAdminUser(u.user_id)} className="adm-delete-btn">Remove</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <p className="adm-label" style={{ marginBottom: 12 }}>Add New User</p>
                      <form onSubmit={createAdminUser} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <label className="adm-label">Email</label>
                          <input
                            type="email"
                            required
                            value={newUserForm.email}
                            onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                            placeholder="email@example.com"
                            className="adm-input"
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <label className="adm-label">Password</label>
                          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                            <input
                              type={showNewUserPassword ? "text" : "password"}
                              required
                              value={newUserForm.password}
                              onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                              placeholder="Set a password"
                              className="adm-input"
                              style={{ paddingRight: 36 }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewUserPassword((v) => !v)}
                              style={{ position: "absolute", right: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, padding: 0, lineHeight: 1 }}
                              tabIndex={-1}
                            >
                              {showNewUserPassword ? "Hide" : "Show"}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="adm-label">Role</label>
                          <select
                            value={newUserForm.role}
                            onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                            className="adm-input"
                            style={{ width: "auto" }}
                          >
                            <option value="admin">Admin (view only)</option>
                            <option value="owner">Owner (full access)</option>
                          </select>
                        </div>
                        {newUserError && <p className="adm-error">{newUserError}</p>}
                        <button type="submit" disabled={newUserSubmitting} className="adm-btn">
                          {newUserSubmitting ? "Creating…" : "Create User"}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Payment Info */}
                  <div className="adm-card">
                    <div className="adm-card-header">
                      <span className="adm-card-title">Payment Info</span>
                    </div>
                    <div className="adm-card-body">
                      <form onSubmit={saveVenmo} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480 }}>
                        <div>
                          <label className="adm-label">Venmo Handle</label>
                          <input
                            type="text"
                            value={venmoForm.venmo_handle}
                            onChange={(e) => setVenmoForm({ ...venmoForm, venmo_handle: e.target.value })}
                            placeholder="@handle"
                            className="adm-input"
                          />
                        </div>
                        <div>
                          <label className="adm-label">Venmo URL</label>
                          <input
                            type="text"
                            value={venmoForm.venmo_url}
                            onChange={(e) => setVenmoForm({ ...venmoForm, venmo_url: e.target.value })}
                            placeholder="https://venmo.com/username"
                            className="adm-input"
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button type="submit" disabled={venmoSaving} className="adm-btn">
                            {venmoSaving ? "Saving…" : "Save Venmo"}
                          </button>
                          {venmoSaved && <span style={{ fontSize: 12, color: "var(--gold)", fontFamily: "'IBM Plex Mono', monospace" }}>Saved ✓</span>}
                        </div>
                      </form>
                      <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>
                          Cash App handle ($AcaciaOSU) is hardcoded — contact the developer to update it.
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
