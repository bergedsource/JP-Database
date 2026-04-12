"use client";

import "./admin.css";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { AuditLog, Fine, Member, SocialProbation, SocialProbationReason } from "@/lib/types";
import FinesTab from "./components/FinesTab";
import OutstandingTab from "./components/OutstandingTab";
import MembersTab from "./components/MembersTab";
import SocialProbationTab from "./components/SocialProbationTab";
import AuditTab from "./components/AuditTab";
import EventsTab from "./components/EventsTab";
import SessionsTab from "./components/SessionsTab";

type Tab = "fines" | "outstanding" | "members" | "soc pro" | "audit" | "sessions" | "transition" | "events";


export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fines");
  const [members, setMembers] = useState<Member[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
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


  const [socialProbations, setSocialProbations] = useState<SocialProbation[]>([]);

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
              onClick={() => setTab("sessions")}
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
                <MembersTab members={members} fines={fines} isPrivileged={isPrivileged} refresh={loadData} />
              )}

              {/* SOCIAL PROBATION TAB */}
              {tab === "soc pro" && (
                <SocialProbationTab members={members} socialProbations={socialProbations} isPrivileged={isPrivileged} refresh={loadData} />
              )}


              {tab === "audit" && isPrivileged && <AuditTab auditLogs={auditLogs} />}

              {tab === "events" && userRole === "root" && <EventsTab eventLog={eventLog} />}

              {tab === "sessions" && <SessionsTab isPrivileged={isPrivileged} />}

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
