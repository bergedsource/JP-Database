"use client";

import { useEffect, useState } from "react";
import type { FineStatus, JpSession, JpSessionChange, JpSessionFine } from "@/lib/types";

const STATUS_COLORS: Record<FineStatus, { bg: string; color: string; border: string }> = {
  pending:    { bg: "rgba(251,191,36,0.1)",   color: "#FCD34D", border: "rgba(251,191,36,0.3)" },
  upheld:     { bg: "rgba(239,68,68,0.1)",    color: "#F87171", border: "rgba(239,68,68,0.3)" },
  overturned: { bg: "rgba(251,146,60,0.1)",   color: "#FB923C", border: "rgba(251,146,60,0.3)" },
  dismissed:  { bg: "rgba(52,211,153,0.1)",   color: "#34D399", border: "rgba(52,211,153,0.3)" },
  paid:       { bg: "rgba(96,165,250,0.1)",   color: "#60A5FA", border: "rgba(96,165,250,0.3)" },
  added_to_dues: { bg: "rgba(45,212,191,0.1)", color: "#5EEAD4", border: "rgba(45,212,191,0.3)" },
  labor:      { bg: "rgba(167,139,250,0.1)",  color: "#A78BFA", border: "rgba(167,139,250,0.3)" },
};

type SessionDetail = {
  session: JpSession;
  fines: JpSessionFine[];
  changes: JpSessionChange[];
};

export default function SessionsTab({ isPrivileged, refresh }: { isPrivileged: boolean; refresh: () => Promise<void> | void }) {
  const [sessions, setSessions] = useState<JpSession[]>([]);
  const [sessionView, setSessionView] = useState<"list" | "detail">("list");
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [newSessionSubmitting, setNewSessionSubmitting] = useState(false);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");

  // Inline amount editing, one fine at a time.
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [amountSaving, setAmountSaving] = useState(false);
  const [amountError, setAmountError] = useState("");

  async function loadSessions() {
    setSessionLoading(true);
    setSessionError("");
    const res = await fetch("/api/admin/sessions");
    if (res.ok) setSessions(await res.json());
    else setSessionError("Failed to load sessions.");
    setSessionLoading(false);
  }

  // Deferred one microtask so loadSessions' opening setSessionLoading/setSessionError
  // don't run during the effect's synchronous phase.
  useEffect(() => {
    void Promise.resolve().then(loadSessions);
  }, []);

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
      // The fine itself changed, so the Fines/Outstanding tabs' copies are now stale.
      await refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setSessionError(data.error ?? "Failed to update fine status.");
    }
  }

  function startEditAmount(fineId: string, current: number | null) {
    setAmountError("");
    setEditingAmountId(fineId);
    setAmountDraft(current != null ? String(current) : "");
  }

  function cancelEditAmount() {
    setEditingAmountId(null);
    setAmountDraft("");
    setAmountError("");
  }

  async function saveAmount(sessionId: string, fineId: string) {
    const raw = amountDraft.trim();
    // Empty clears the amount, which the API accepts as null.
    if (raw !== "") {
      const parsed = parseFloat(raw);
      if (!isFinite(parsed) || parsed < 0 || parsed > 10000) {
        setAmountError("Enter an amount between $0 and $10,000, or leave it blank.");
        return;
      }
    }
    setAmountSaving(true);
    setAmountError("");
    const res = await fetch(`/api/admin/sessions/${sessionId}/update-fine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fine_id: fineId, amount: raw === "" ? null : raw }),
    });
    if (res.ok) {
      cancelEditAmount();
      await loadSessionDetail(sessionId);
      // Push the new amount into the tabs that hold their own copy of the fines list.
      await refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setAmountError(data.error ?? "Failed to update amount.");
    }
    setAmountSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sessionError && <p className="adm-error">{sessionError}</p>}

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

      {sessionView === "detail" && sessionDetail && (
        <>
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
                    // Amounts are editable only by owner/root and only while the session is
                    // open — once closed it's the ratified record. Matches the status dropdown.
                    const canEditAmounts = isPrivileged && !sessionDetail.session.closed_at;
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
                            {!canEditAmounts && fine.amount != null ? ` · $${fine.amount.toFixed(2)}` : ""}
                          </p>
                          {canEditAmounts && (
                            editingAmountId === fine.fine_id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="10000"
                                  value={amountDraft}
                                  onChange={(e) => setAmountDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveAmount(sessionDetail.session.id, fine.fine_id);
                                    if (e.key === "Escape") cancelEditAmount();
                                  }}
                                  placeholder="blank = none"
                                  className="adm-input"
                                  style={{ width: 110 }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => saveAmount(sessionDetail.session.id, fine.fine_id)}
                                  disabled={amountSaving}
                                  className="adm-btn"
                                  style={{ fontSize: 11, padding: "4px 10px" }}
                                >
                                  {amountSaving ? "Saving…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditAmount}
                                  disabled={amountSaving}
                                  style={{ fontSize: 11, padding: "4px 8px", background: "none", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: 5, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}
                                >
                                  Cancel
                                </button>
                                {amountError && (
                                  <span role="alert" style={{ fontSize: 11, color: "#F87171" }}>{amountError}</span>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: fine.amount != null ? "var(--gold)" : "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                                  {fine.amount != null ? `$${fine.amount.toFixed(2)}` : "no amount"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startEditAmount(fine.fine_id, fine.amount)}
                                  style={{ fontSize: 11, padding: "2px 8px", background: "rgba(207,181,59,0.1)", border: "1px solid rgba(207,181,59,0.3)", color: "var(--gold)", borderRadius: 5, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}
                                >
                                  Edit amount
                                </button>
                              </div>
                            )
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                          <span className="adm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                            {fine.status.replace(/_/g, " ")}
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
                              <option value="added_to_dues">Added to Dues</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{fine.status.replace(/_/g, " ")}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

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
  );
}
