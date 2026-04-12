"use client";

import "./admin.css";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { AuditLog, Fine, FineStatus, JpSession, JpSessionChange, JpSessionFine, Member, SocialProbation, SocialProbationReason } from "@/lib/types";
import FinesTab from "./components/FinesTab";
import OutstandingTab from "./components/OutstandingTab";

const STATUS_COLORS: Record<FineStatus, { bg: string; color: string; border: string }> = {
  pending:    { bg: "rgba(251,191,36,0.1)",   color: "#FCD34D", border: "rgba(251,191,36,0.3)" },
  upheld:     { bg: "rgba(239,68,68,0.1)",    color: "#F87171", border: "rgba(239,68,68,0.3)" },
  overturned: { bg: "rgba(251,146,60,0.1)",   color: "#FB923C", border: "rgba(251,146,60,0.3)" },
  dismissed: { bg: "rgba(52,211,153,0.1)",   color: "#34D399", border: "rgba(52,211,153,0.3)" },
  paid:      { bg: "rgba(96,165,250,0.1)",   color: "#60A5FA", border: "rgba(96,165,250,0.3)" },
  labor:     { bg: "rgba(167,139,250,0.1)",  color: "#A78BFA", border: "rgba(167,139,250,0.3)" },
};

type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit" | "sessions" | "transition" | "events";

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

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fines");
  const [members, setMembers] = useState<Member[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [sessions, setSessions] = useState<JpSession[]>([]);
  const [sessionView, setSessionView] = useState<"list" | "detail">("list");
  const [sessionDetail, setSessionDetail] = useState<{
    session: JpSession;
    fines: JpSessionFine[];
    changes: JpSessionChange[];
  } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [newSessionSubmitting, setNewSessionSubmitting] = useState(false);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [eventLog, setCreatorLogs] = useState<AuditLog[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [userRole, setUserRole] = useState<"owner" | "admin" | "root" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isPrivileged = userRole === "owner" || userRole === "root";
  const [adminUsers, setAdminUsers] = useState<{ user_id: string; email: string; role: string; created_at: string }[]>([]);
  const [newUserForm, setNewUserForm] = useState({ email: "", password: "", role: "admin" });
  const [newUserSubmitting, setNewUserSubmitting] = useState(false);
  const [newUserError, setNewUserError] = useState("");
  const [venmoForm, setVenmoForm] = useState({ venmo_handle: "", venmo_url: "" });
  const [venmoSaving, setVenmoSaving] = useState(false);
  const [venmoSaved, setVenmoSaved] = useState(false);
  const [defaultSheetId, setDefaultSheetId] = useState("");
  const [defaultSheetSaving, setDefaultSheetSaving] = useState(false);
  const [defaultSheetSaved, setDefaultSheetSaved] = useState(false);
  const [showSheetHelp, setShowSheetHelp] = useState(false);
  const [exportTerm, setExportTerm] = useState("");
  const [exportSheetId, setExportSheetId] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportResult, setExportResult] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);
  const [exportHistory, setExportHistory] = useState<{ spreadsheetId: string; term: string; date: string; url: string }[]>([]);
  const [showExportHelp, setShowExportHelp] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  // Member form state
  const [memberForm, setMemberForm] = useState({
    name: "",
    status: "active" as Member["status"],
    roll: "",
  });
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberError, setMemberError] = useState("");

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
    loadData();
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email ?? "unknown");
    });
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => { setUserRole(d.role ?? null); setCurrentUserId(d.userId ?? null); })
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



  async function loadAdminUsers() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setAdminUsers(await res.json());
  }

  async function bulkExport() {
    if (!exportTerm) return;
    setExportLoading(true);
    setExportResult(null);
    const res = await fetch("/api/admin/bulk-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: exportTerm, spreadsheetId: exportSheetId }),
    });
    const data = await res.json();
    if (res.ok) {
      setExportResult({ ok: true, msg: `Exported ${data.count} fine${data.count !== 1 ? "s" : ""} to "${data.tab}"`, url: data.url });
      await loadVenmoSettings(); // refresh history
    } else {
      setExportResult({ ok: false, msg: data.error ?? "Export failed" });
    }
    setExportLoading(false);
  }

  async function loadVenmoSettings() {
    const res = await fetch("/api/admin/settings");
    if (res.ok) {
      const data = await res.json();
      setVenmoForm({ venmo_handle: data.venmo_handle ?? "", venmo_url: data.venmo_url ?? "" });
      setDefaultSheetId(data.google_spreadsheet_id ?? "");
      try {
        setExportHistory(data.export_history ? JSON.parse(data.export_history) : []);
      } catch { setExportHistory([]); }
    }
  }

  async function loadSessions() {
    setSessionLoading(true);
    setSessionError("");
    const res = await fetch("/api/admin/sessions");
    if (res.ok) setSessions(await res.json());
    else setSessionError("Failed to load sessions.");
    setSessionLoading(false);
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setNewSessionSubmitting(true);
    setSessionError("");
    const res = await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date_held: newSessionDate }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewSessionDate(new Date().toISOString().split("T")[0]);
      await loadSessionDetail(data.id);
    } else {
      setSessionError("Failed to create session.");
    }
    setNewSessionSubmitting(false);
  }

  async function loadSessionDetail(id: string) {
    setSessionDetailLoading(true);
    setSessionError("");
    const res = await fetch(`/api/admin/sessions/${id}`);
    if (res.ok) {
      setSessionDetail(await res.json());
      setSessionView("detail");
    } else {
      setSessionError("Failed to load session.");
    }
    setSessionDetailLoading(false);
  }

  async function closeSession(id: string) {
    if (!confirm("Close this session? Owner and root can still make changes after closing.")) return;
    setSessionError("");
    const res = await fetch(`/api/admin/sessions/${id}/close`, { method: "POST" });
    if (res.ok) {
      await loadSessionDetail(id);
      await loadSessions();
    } else {
      setSessionError("Failed to close session.");
    }
  }

  async function updateSessionFineStatus(sessionId: string, fineId: string, newStatus: FineStatus) {
    setSessionError("");
    const res = await fetch(`/api/admin/sessions/${sessionId}/update-fine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fine_id: fineId, new_status: newStatus }),
    });
    if (res.ok) {
      await loadSessionDetail(sessionId);
    } else {
      setSessionError("Failed to update fine status.");
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

  async function saveDefaultSheet(e: React.FormEvent) {
    e.preventDefault();
    setDefaultSheetSaving(true);
    await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "google_spreadsheet_id", value: defaultSheetId.trim() }),
    });
    setDefaultSheetSaving(false);
    setDefaultSheetSaved(true);
    setTimeout(() => setDefaultSheetSaved(false), 2500);
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

  async function log(action: string, details: string) {
    const table = userRole === "root" ? "system_events" : "audit_logs";
    await supabase.from(table).insert({ admin_email: adminEmail, action, details });
  }

  async function loadEventLog() {
    const { data } = await supabase
      .from("system_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setCreatorLogs(data ?? []);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
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

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

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
            {(["fines", "outstanding", "members", "soc pro"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`adm-tab${tab === t ? " active" : ""}`}
              >
                {t}
              </button>
            ))}
            {isPrivileged && (
              <button
                className={`adm-tab${tab === "audit" ? " active" : ""}`}
                onClick={() => setTab("audit")}
              >
                audit
              </button>
            )}
            <button
              className={`adm-tab${tab === "sessions" ? " active" : ""}`}
              onClick={() => { setTab("sessions"); loadSessions(); setSessionView("list"); }}
            >
              sessions
            </button>
            {isPrivileged && (
              <button
                className={`adm-tab${tab === "transition" ? " active" : ""}`}
                onClick={() => { setTab("transition"); loadAdminUsers(); loadVenmoSettings(); }}
              >
                Transition
              </button>
            )}
            {userRole === "root" && (
              <button
                className={`adm-tab${tab === "events" ? " active" : ""}`}
                onClick={() => { setTab("events"); loadEventLog(); }}
              >
                creator log
              </button>
            )}
          </div>

          {loading ? (
            <p className="adm-loading">Loading records…</p>
          ) : (
            <>
              {/* FINES TAB */}
              {tab === "fines" && (
                <FinesTab members={members} fines={fines} isPrivileged={isPrivileged} currentUserId={currentUserId} userRole={userRole} refresh={loadData} />
              )}


              {/* OUTSTANDING TAB */}
              {tab === "outstanding" && (
                <OutstandingTab members={members} fines={fines} isPrivileged={isPrivileged} currentUserId={currentUserId} userRole={userRole} refresh={loadData} />
              )}

              {/* MEMBERS TAB */}
              {tab === "members" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {isPrivileged && <div className="adm-card">
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
                        {isPrivileged && (
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
                                  {isPrivileged ? (
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
                                  {isPrivileged && (
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
                    {isPrivileged && <div className="adm-card">
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
                          {isPrivileged && (
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
                        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
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
                                  {isPrivileged && (
                                    <button onClick={() => removeSocialProbation(sp.id, sp.member_name ?? "Unknown", sp.reason)} className="adm-delete-btn">
                                      Lift
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* AUDIT LOG TAB */}
              {tab === "audit" && isPrivileged && (
                <div>
                  {(() => {
                    const now = new Date();
                    const nextReset = new Date(Date.UTC(now.getUTCMonth() >= 0 && now.getUTCMonth() === 0 && now.getUTCDate() >= 4 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(), 0, 4, 23, 59, 0));
                    if (now >= nextReset) nextReset.setUTCFullYear(nextReset.getUTCFullYear() + 1);
                    const diff = nextReset.getTime() - now.getTime();
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    return (
                      <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#F87171", fontSize: 13, fontWeight: 600 }}>⚠ Annual Reset:</span>
                        <span style={{ color: "#F87171", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {days}d {hours}h {mins}m until all fines are deleted (Jan 4)
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}
              {tab === "audit" && isPrivileged && (
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

              {/* EVENTS TAB */}
              {tab === "events" && userRole === "root" && (
                <div className="adm-card">
                  {eventLog.length === 0 ? (
                    <p className="adm-empty">No creator actions recorded yet.</p>
                  ) : (
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Action</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eventLog.map((log) => (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                              {new Date(log.created_at).toLocaleDateString()}{" "}
                              <span style={{ color: "var(--text-dim)" }}>
                                {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </td>
                            <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{log.action}</td>
                            <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{log.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === "sessions" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                  {sessionError && <p className="adm-error">{sessionError}</p>}

                  {/* New Session — owner/root only */}
                  {isPrivileged && sessionView === "list" && (
                    <div className="adm-card">
                      <div className="adm-card-header">
                        <span className="adm-card-title">New Session</span>
                      </div>
                      <div className="adm-card-body">
                        <form onSubmit={createSession} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <div>
                            <label className="adm-label">Date Held</label>
                            <input
                              type="date"
                              value={newSessionDate}
                              onChange={(e) => setNewSessionDate(e.target.value)}
                              className="adm-input"
                              required
                            />
                          </div>
                          <button type="submit" disabled={newSessionSubmitting} className="adm-btn">
                            {newSessionSubmitting ? "Starting…" : "Start Session"}
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* Sessions list */}
                  {sessionView === "list" && (
                    <div className="adm-card">
                      <div className="adm-card-header">
                        <span className="adm-card-title">All Sessions</span>
                      </div>
                      {sessionLoading ? (
                        <p className="adm-empty">Loading…</p>
                      ) : sessions.length === 0 ? (
                        <p className="adm-empty">No sessions yet.</p>
                      ) : (
                        <table className="adm-table">
                          <thead>
                            <tr>
                              <th>Date Held</th>
                              <th>Fines</th>
                              <th>Status</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {sessions.map((s) => (
                              <tr key={s.id}>
                                <td style={{ fontWeight: 500 }}>
                                  {new Date(s.date_held + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                </td>
                                <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                                  {s.fine_count} fine{s.fine_count !== 1 ? "s" : ""}
                                </td>
                                <td>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" as const,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    color: s.closed_at ? "var(--text-dim)" : "var(--gold)",
                                  }}>
                                    {s.closed_at ? "closed" : "open"}
                                  </span>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    onClick={() => loadSessionDetail(s.id)}
                                    style={{ fontSize: 12, background: "rgba(207,181,59,0.1)", border: "1px solid rgba(207,181,59,0.3)", color: "var(--gold)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Session detail */}
                  {sessionView === "detail" && sessionDetail && (
                    <>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setSessionView("list")}
                          style={{ background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontFamily: "'IBM Plex Sans', sans-serif" }}
                        >
                          ← Back
                        </button>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                          {new Date(sessionDetail.session.date_held + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" as const,
                          fontFamily: "'IBM Plex Mono', monospace",
                          color: sessionDetail.session.closed_at ? "var(--text-dim)" : "var(--gold)",
                        }}>
                          {sessionDetail.session.closed_at ? "closed" : "open"}
                        </span>
                        {isPrivileged && !sessionDetail.session.closed_at && (
                          <button
                            onClick={() => closeSession(sessionDetail.session.id)}
                            style={{ marginLeft: "auto", fontSize: 12, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--red)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}
                          >
                            Close Session
                          </button>
                        )}
                      </div>

                      {sessionDetailLoading ? (
                        <p className="adm-empty">Loading…</p>
                      ) : (
                        <>
                          {/* Fines in this session */}
                          <div className="adm-card">
                            <div className="adm-card-header">
                              <span className="adm-card-title">Fines in This Session</span>
                              <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                                {sessionDetail.fines.length} fine{sessionDetail.fines.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            {sessionDetail.fines.length === 0 ? (
                              <p className="adm-empty">No fines were pending when this session was created.</p>
                            ) : (
                              sessionDetail.fines.map((fine) => {
                                const sc = STATUS_COLORS[fine.status as FineStatus] ?? { bg: "transparent", color: "#8B949E", border: "#30363D" };
                                return (
                                  <div key={fine.fine_id} className="adm-fine-row" style={{ borderLeftColor: sc.color }}>
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
                                        {fine.fining_officer ? ` · Officer: ${fine.fining_officer}` : ""}
                                        {fine.amount != null ? ` · $${fine.amount.toFixed(2)}` : ""}
                                      </p>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                                      <span className="adm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                                        {fine.status}
                                      </span>
                                      {isPrivileged ? (
                                        <select
                                          value={fine.status}
                                          onChange={(e) => updateSessionFineStatus(sessionDetail.session.id, fine.fine_id, e.target.value as FineStatus)}
                                          className="adm-status-select"
                                          disabled={!!sessionDetail.session.closed_at}
                                        >
                                          <option value="pending">Pending</option>
                                          <option value="upheld">Upheld</option>
                                          <option value="dismissed">Dismissed</option>
                                          <option value="overturned">Overturned</option>
                                          <option value="paid">Paid</option>
                                          <option value="labor">Labor</option>
                                        </select>
                                      ) : (
                                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{fine.status}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Changes log */}
                          <div className="adm-card">
                            <div className="adm-card-header">
                              <span className="adm-card-title">Changes This Session</span>
                            </div>
                            <div className="adm-card-body">
                              {sessionDetail.changes.length === 0 ? (
                                <p style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>No changes recorded yet.</p>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {sessionDetail.changes.map((c) => (
                                    <div key={c.id} style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: "var(--text-muted)", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{c.member_name}</span>
                                      {" · "}
                                      <span>{c.fine_type}</span>
                                      {" · "}
                                      <span style={{ color: "var(--text-dim)" }}>{c.old_status}</span>
                                      {" → "}
                                      <span style={{ color: "var(--gold)" }}>{c.new_status}</span>
                                      {" · by "}
                                      <span>{c.changed_by_email}</span>
                                      {" · "}
                                      <span style={{ color: "var(--text-dim)" }}>
                                        {new Date(c.changed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                </div>
              )}

              {/* SETTINGS TAB */}
              {tab === "transition" && isPrivileged && (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

                  {/* Transition Guide */}
                  <div style={{ padding: "12px 16px", background: "rgba(207,181,59,0.07)", border: "1px solid rgba(207,181,59,0.2)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>New to this site? Read the handoff guide before getting started.</span>
                    <a href="https://docs.google.com/document/d/1dn5JJvAwGOMYLNr0q-QoH2RwRXcIZPsRHoVo6Cx7azY/edit?tab=t.0" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#CFB53B", whiteSpace: "nowrap", marginLeft: 16, textDecoration: "none" }}>
                      Transition Guide →
                    </a>
                  </div>

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
                                {u.role === "admin" && userRole !== "root" && (
                                  <button
                                    onClick={() => transferOwnership(u.user_id, u.email)}
                                    style={{ background: "rgba(207,181,59,0.1)", border: "1px solid rgba(207,181,59,0.3)", color: "var(--gold)", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}
                                  >
                                    Transfer Ownership
                                  </button>
                                )}
                                {u.user_id !== currentUserId && (
                                  <button onClick={() => removeAdminUser(u.user_id)} className="adm-delete-btn">Remove</button>
                                )}
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

                  {/* Term Export */}
                  <div className="adm-card">
                    <div className="adm-card-header">
                      <span className="adm-card-title">Term Export</span>
                    </div>
                    <div className="adm-card-body">
                      <p className="adm-label" style={{ marginBottom: 12 }}>Export all fines for a term to Google Sheets</p>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <label className="adm-label">Term</label>
                          <select
                            value={exportTerm}
                            onChange={(e) => { setExportTerm(e.target.value); setExportResult(null); }}
                            className="adm-input"
                          >
                            <option value="">— Select term —</option>
                            {[...new Set(fines.map((f) => f.term))].sort().reverse().map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={bulkExport}
                          disabled={!exportTerm || exportLoading}
                          className="adm-btn"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {exportLoading ? "Exporting…" : "Export to Sheets"}
                        </button>
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <label className="adm-label">Custom Spreadsheet ID <span className="adm-opt">optional</span></label>
                        <input
                          type="text"
                          value={exportSheetId}
                          onChange={(e) => { setExportSheetId(e.target.value); setExportResult(null); }}
                          placeholder="Paste a spreadsheet ID to export there instead"
                          className="adm-input"
                        />
                        <p style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
                          Leave blank to use the default sheet.{" "}
                          <button type="button" onClick={() => setShowExportHelp(!showExportHelp)} style={{ background: "none", border: "none", color: "var(--gold)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                            How to use a new sheet {showExportHelp ? "▲" : "▼"}
                          </button>
                        </p>
                        {showExportHelp && (
                          <div style={{ marginTop: 8, padding: "12px 14px", background: "var(--surface-2)", borderRadius: 7, border: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.8 }}>
                            <p style={{ fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Setting up a new Google Sheet:</p>
                            <ol style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                              <li>Go to <a href="https://sheets.google.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>sheets.google.com</a> and create a blank spreadsheet</li>
                              <li>Click <strong style={{ color: "var(--text)" }}>Share</strong> (top right) and add this email as <strong style={{ color: "var(--text)" }}>Editor</strong>:<br />
                                <span style={{ color: "var(--gold)", userSelect: "all" }}>acacia-jp-sheets@jp-database-491921.iam.gserviceaccount.com</span>
                              </li>
                              <li>Copy the ID from the URL — it{"'"}s the long string between <strong style={{ color: "var(--text)" }}>/d/</strong> and <strong style={{ color: "var(--text)" }}>/edit</strong><br />
                                <span style={{ color: "var(--text-dim)" }}>e.g. docs.google.com/spreadsheets/d/<strong style={{ color: "var(--gold)" }}>1BxiM...abc</strong>/edit</span>
                              </li>
                              <li>Paste that ID into the field above</li>
                            </ol>
                          </div>
                        )}
                      </div>

                      {exportHistory.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <p className="adm-label" style={{ marginBottom: 8 }}>Past Exports</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {exportHistory.map((h, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)", gap: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace" }}>{h.term}</span>
                                  <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", marginLeft: 8 }}>{h.date}</span>
                                  <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.spreadsheetId}</div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onClick={() => { setExportSheetId(h.spreadsheetId); setExportResult(null); }}
                                    style={{ fontSize: 11, background: "rgba(207,181,59,0.1)", border: "1px solid rgba(207,181,59,0.3)", color: "var(--gold)", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}
                                  >
                                    Use
                                  </button>
                                  <a href={h.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 5, padding: "3px 8px", textDecoration: "none", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                                    Open ↗
                                  </a>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Remove the saved link for "${h.term}"? This won't delete the actual spreadsheet.`)) return;
                                      const updated = exportHistory.filter((_, idx) => idx !== i);
                                      setExportHistory(updated);
                                      await fetch("/api/admin/settings", {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ key: "export_history", value: JSON.stringify(updated) }),
                                      });
                                    }}
                                    className="adm-delete-btn"
                                    style={{ fontSize: 11, padding: "3px 8px" }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {exportResult && (
                        <div style={{ marginTop: 10 }}>
                          <p style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: exportResult.ok ? "#34D399" : "var(--red)" }}>
                            {exportResult.msg}
                          </p>
                          {exportResult.url && (
                            <a href={exportResult.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--gold)", fontFamily: "'IBM Plex Mono', monospace", textDecoration: "none", display: "inline-block", marginTop: 6 }}>
                              Open new sheet ↗
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Change Budget Sheet */}
                  <div className="adm-card">
                    <div className="adm-card-header">
                      <span className="adm-card-title">Default Budget Sheet</span>
                    </div>
                    <div className="adm-card-body">
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
                        Paste the spreadsheet ID for the chapter budget sheet here. All paid fine exports will go to this sheet permanently — no Vercel access needed.
                      </p>
                      <form onSubmit={saveDefaultSheet} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
                        <div>
                          <label className="adm-label">Spreadsheet ID</label>
                          <input
                            type="text"
                            value={defaultSheetId}
                            onChange={(e) => setDefaultSheetId(e.target.value)}
                            placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                            className="adm-input"
                          />
                          <p style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
                            The long string between <strong style={{ color: "var(--text)" }}>/d/</strong> and <strong style={{ color: "var(--text)" }}>/edit</strong> in the sheet URL.{" "}
                            <button type="button" onClick={() => setShowSheetHelp(!showSheetHelp)} style={{ background: "none", border: "none", color: "var(--gold)", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                              How to set it up {showSheetHelp ? "▲" : "▼"}
                            </button>
                          </p>
                          {showSheetHelp && (
                            <div style={{ marginTop: 8, padding: "12px 14px", background: "var(--surface-2)", borderRadius: 7, border: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.8 }}>
                              <ol style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                                <li>Open the budget spreadsheet in Google Sheets</li>
                                <li>Click <strong style={{ color: "var(--text)" }}>Share</strong> and add this email as <strong style={{ color: "var(--text)" }}>Editor</strong>:<br />
                                  <span style={{ color: "var(--gold)", userSelect: "all" }}>acacia-jp-sheets@jp-database-491921.iam.gserviceaccount.com</span>
                                </li>
                                <li>Copy the ID from the URL and paste it above</li>
                              </ol>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button type="submit" disabled={defaultSheetSaving} className="adm-btn">
                            {defaultSheetSaving ? "Saving…" : "Save Sheet"}
                          </button>
                          {defaultSheetSaved && <span style={{ fontSize: 12, color: "var(--gold)", fontFamily: "'IBM Plex Mono', monospace" }}>Saved ✓</span>}
                        </div>
                      </form>
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
