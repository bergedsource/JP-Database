"use client";

import { useEffect, useState } from "react";
import FineDetailsEditor from "./FineDetailsEditor";
import { rollMap, sortFines, type FineSort } from "./rollSort";
import type { FineStatus, JpSession, JpSessionChange, JpSessionFine, Member } from "@/lib/types";

const STATUS_COLORS: Record<FineStatus, { bg: string; color: string; border: string }> = {
  pending:    { bg: "rgba(251,191,36,0.1)",   color: "#FCD34D", border: "rgba(251,191,36,0.3)" },
  upheld:     { bg: "rgba(239,68,68,0.1)",    color: "#F87171", border: "rgba(239,68,68,0.3)" },
  overturned: { bg: "rgba(251,146,60,0.1)",   color: "#FB923C", border: "rgba(251,146,60,0.3)" },
  dismissed:  { bg: "rgba(52,211,153,0.1)",   color: "#34D399", border: "rgba(52,211,153,0.3)" },
  paid:       { bg: "rgba(96,165,250,0.1)",   color: "#60A5FA", border: "rgba(96,165,250,0.3)" },
  added_to_dues: { bg: "rgba(45,212,191,0.1)", color: "#5EEAD4", border: "rgba(45,212,191,0.3)" },
  labor:      { bg: "rgba(167,139,250,0.1)",  color: "#A78BFA", border: "rgba(167,139,250,0.3)" },
};

// Every status a fine can take, in the order the chair usually reaches for them.
const DECISIONS: { status: FineStatus; label: string }[] = [
  { status: "upheld", label: "Upheld" },
  { status: "dismissed", label: "Dismissed" },
  { status: "overturned", label: "Overturned" },
  { status: "labor", label: "Labor" },
  { status: "paid", label: "Paid" },
  { status: "added_to_dues", label: "Added to dues" },
  { status: "pending", label: "Pending" },
];

const statusLabel = (s: string) => DECISIONS.find((d) => d.status === s)?.label.toLowerCase() ?? s.replace(/_/g, " ");

const longDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

type SessionDetail = {
  session: JpSession;
  fines: JpSessionFine[];
  changes: JpSessionChange[];
};

export default function SessionsTab({ members, isPrivileged, refresh }: { members: Member[]; isPrivileged: boolean; refresh: () => Promise<void> }) {
  const [sessions, setSessions] = useState<JpSession[]>([]);
  const [sessionView, setSessionView] = useState<"list" | "detail">("list");
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split("T")[0]);
  const [newSessionSubmitting, setNewSessionSubmitting] = useState(false);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [savingFineId, setSavingFineId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<FineSort>("newest");
  // Inline amount editing, one fine at a time.
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState("");
  const [amountSaving, setAmountSaving] = useState(false);
  const [amountError, setAmountError] = useState("");
  const [sessionError, setSessionError] = useState("");

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

  // `quiet` refetches without swapping the docket for a loading message, so deciding
  // fines one after another doesn't make the list jump.
  async function loadSessionDetail(id: string, quiet = false) {
    if (!quiet) setSessionDetailLoading(true);
    setSessionError("");
    const res = await fetch(`/api/admin/sessions/${id}`);
    if (res.ok) {
      setSessionDetail(await res.json());
      setSessionView("detail");
    } else {
      setSessionError("Failed to load session.");
    }
    if (!quiet) setSessionDetailLoading(false);
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
    setSavingFineId(fineId);
    const res = await fetch(`/api/admin/sessions/${sessionId}/update-fine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fine_id: fineId, new_status: newStatus }),
    });
    if (res.ok) {
      await loadSessionDetail(sessionId, true);
      // The fine itself changed, so the Fines/Outstanding tabs' copies are now stale.
      await refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setSessionError(data.error ?? "Couldn't save that decision. Try again.");
    }
    setSavingFineId(null);
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
        setAmountError("Enter an amount from $0 to $10,000, or leave it blank for no amount.");
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
      await loadSessionDetail(sessionId, true);
      await refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setAmountError(data.error ?? "Couldn't save the amount. Try again.");
    }
    setAmountSaving(false);
  }

  const decidedCount = sessionDetail ? sessionDetail.fines.filter((f) => f.status !== "pending").length : 0;
  const totalCount = sessionDetail?.fines.length ?? 0;
  const rolls = rollMap(members);
  const docket = sessionDetail
    ? sortFines(sessionDetail.fines, sortBy, rolls)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sessionError && <p className="adm-error" role="alert">{sessionError}</p>}

      {isPrivileged && sessionView === "list" && (
        <div className="adm-card">
          <div className="adm-card-header">
            <span className="adm-card-title">Start a session</span>
          </div>
          <div className="adm-card-body">
            <form onSubmit={createSession} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label className="adm-label" htmlFor="ses-date">Date held</label>
                <input
                  id="ses-date"
                  type="date"
                  value={newSessionDate}
                  onChange={(e) => setNewSessionDate(e.target.value)}
                  className="adm-input"
                  required
                />
              </div>
              <button type="submit" disabled={newSessionSubmitting} className="adm-btn">
                {newSessionSubmitting ? "Starting…" : "Start session"}
              </button>
            </form>
          </div>
        </div>
      )}

      {sessionView === "list" && (
        <div className="adm-card">
          <div className="adm-card-header">
            <span className="adm-card-title">All sessions</span>
          </div>
          {sessionLoading ? (
            <p className="adm-empty">Loading…</p>
          ) : sessions.length === 0 ? (
            <p className="adm-empty">No sessions yet. Start one above when JP meets.</p>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Date held</th>
                  <th>Fines</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>{longDate(s.date_held)}</td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {s.fine_count} fine{s.fine_count !== 1 ? "s" : ""}
                    </td>
                    <td>
                      <span className={`ses-state ${s.closed_at ? "closed" : "open"}`}>
                        {s.closed_at ? "Closed" : "Open"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        onClick={() => loadSessionDetail(s.id)}
                        className="ses-choice"
                        style={{ minHeight: 36 }}
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
          <div className="ses-head">
            <div className="ses-head-text">
              <button type="button" className="ses-back" onClick={() => setSessionView("list")}>
                All sessions
              </button>
              <h2 className="ses-title">
                Session of {longDate(sessionDetail.session.date_held)}
                <span className={`ses-state ${sessionDetail.session.closed_at ? "closed" : "open"}`}>
                  {sessionDetail.session.closed_at ? "Closed" : "Open"}
                </span>
              </h2>
              {totalCount > 0 && (
                <p className="ses-progress-text">
                  {decidedCount} of {totalCount} fines decided.{isPrivileged && !sessionDetail.session.closed_at ? " Each decision saves as soon as you pick it." : ""}
                </p>
              )}
            </div>
            {isPrivileged && !sessionDetail.session.closed_at && (
              <button type="button" className="ses-close-btn" onClick={() => closeSession(sessionDetail.session.id)}>
                Close session
              </button>
            )}
          </div>

          {sessionDetailLoading ? (
            <p className="adm-empty">Loading…</p>
          ) : (
            <div className="ses-layout">
              <section className="ses-docket" aria-label="Fines in this session">
                {totalCount > 1 && (
                  <div className="ses-toolbar">
                    <label htmlFor="ses-sort" className="ses-toolbar-label">Order</label>
                    <select
                      id="ses-sort"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as FineSort)}
                      className="adm-input"
                      style={{ width: "auto" }}
                    >
                      <option value="newest">As listed</option>
                      <option value="roll">Roll #, low to high</option>
                      <option value="roll-desc">Roll #, high to low</option>
                    </select>
                  </div>
                )}
                {totalCount > 0 && (
                  <div
                    className="ses-progress"
                    role="progressbar"
                    aria-label="Fines decided"
                    aria-valuemin={0}
                    aria-valuemax={totalCount}
                    aria-valuenow={decidedCount}
                  >
                    <div style={{ width: `${(decidedCount / totalCount) * 100}%` }} />
                  </div>
                )}

                {totalCount === 0 ? (
                  <div className="adm-card"><p className="adm-empty">No fines were pending when this session was created.</p></div>
                ) : (
                  docket.map((fine) => {
                    const canDecide = isPrivileged && !sessionDetail.session.closed_at;
                    const saving = savingFineId === fine.fine_id;
                    return (
                      <article key={fine.fine_id} className={`ses-fine${fine.status !== "pending" ? " decided" : ""}`}>
                        <div className="ses-fine-top">
                          <div className="ses-fine-who">
                            <span className="ses-fine-name">
                              {fine.member_name}
                              {rolls.get(fine.member_id) != null && <span className="adm-roll">#{rolls.get(fine.member_id)}</span>}
                            </span>
                            <span className="ses-fine-type">
                              {fine.fine_type}
                              {!canDecide && fine.amount != null ? `, $${fine.amount.toFixed(2)}` : ""}
                            </span>
                          </div>
                          {/* Amounts are editable by owner/root while the session is open; once closed it's the ratified record. */}
                          {canDecide && (
                            editingAmountId === fine.fine_id ? (
                              <div className="ses-amount-edit">
                                <label className="ses-amount-field">
                                  <span aria-hidden="true">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="10000"
                                    inputMode="decimal"
                                    aria-label={`Amount for ${fine.member_name}`}
                                    value={amountDraft}
                                    onChange={(e) => { setAmountDraft(e.target.value); setAmountError(""); }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveAmount(sessionDetail.session.id, fine.fine_id);
                                      if (e.key === "Escape") cancelEditAmount();
                                    }}
                                    placeholder="No amount"
                                    autoFocus
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="adm-btn"
                                  disabled={amountSaving}
                                  onClick={() => saveAmount(sessionDetail.session.id, fine.fine_id)}
                                >
                                  {amountSaving ? "Saving…" : "Save"}
                                </button>
                                <button type="button" className="ses-choice" disabled={amountSaving} onClick={cancelEditAmount}>
                                  Cancel
                                </button>
                                {amountError && <p role="alert" className="adm-error ses-amount-error">{amountError}</p>}
                              </div>
                            ) : (
                              <div className="ses-amount">
                                <span className={`ses-amount-value${fine.amount == null ? " none" : ""}`}>
                                  {fine.amount != null ? `$${fine.amount.toFixed(2)}` : "No amount"}
                                </span>
                                <button
                                  type="button"
                                  className="ses-amount-btn"
                                  aria-label={`Edit amount for ${fine.member_name}`}
                                  onClick={() => startEditAmount(fine.fine_id, fine.amount)}
                                >
                                  Edit amount
                                </button>
                              </div>
                            )
                          )}
                          {!canDecide && (
                            <span
                              className="adm-status-badge"
                              style={{
                                background: STATUS_COLORS[fine.status as FineStatus]?.bg,
                                color: STATUS_COLORS[fine.status as FineStatus]?.color,
                                borderColor: STATUS_COLORS[fine.status as FineStatus]?.border,
                              }}
                            >
                              {statusLabel(fine.status)}
                            </span>
                          )}
                        </div>

                        <FineDetailsEditor
                          key={`${fine.fine_id}:${fine.description}:${fine.notes ?? ""}`}
                          fineId={fine.fine_id}
                          description={fine.description}
                          notes={fine.notes}
                          canEdit={isPrivileged}
                          onSaved={(description, notes) => {
                            setSessionDetail((d) => d && { ...d, fines: d.fines.map((f) => f.fine_id === fine.fine_id ? { ...f, description, notes } : f) });
                            return refresh();
                          }}
                        />
                        <p className="adm-fine-meta" style={{ margin: 0 }}>
                          Issued {new Date(fine.date_issued + "T12:00:00").toLocaleDateString()}, {fine.term}
                          {fine.fining_officer ? `. Fining officer: ${fine.fining_officer}` : ""}
                        </p>

                        {canDecide && (
                          <div className="ses-choices" role="group" aria-label={`Decision for ${fine.member_name}`}>
                            {DECISIONS.map((d) => {
                              const selected = fine.status === d.status;
                              return (
                                <button
                                  key={d.status}
                                  type="button"
                                  className={`ses-choice${selected ? " selected" : ""}`}
                                  aria-pressed={selected}
                                  disabled={saving}
                                  onClick={() => {
                                    if (!selected) updateSessionFineStatus(sessionDetail.session.id, fine.fine_id, d.status);
                                  }}
                                >
                                  <span className="ses-choice-dot" style={{ background: STATUS_COLORS[d.status].color }} aria-hidden="true" />
                                  {d.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </section>

              <aside className="ses-log adm-card" aria-label="Changes this session">
                <div className="adm-card-header">
                  <span className="adm-card-title">Changes this session</span>
                </div>
                <div className="adm-card-body">
                  {sessionDetail.changes.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>No decisions yet.</p>
                  ) : (
                    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                      {sessionDetail.changes.map((c) => (
                        <li key={c.id} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 14, lineHeight: 1.45 }}>
                          <span>
                            <strong>{c.member_name}</strong>{" "}
                            {statusLabel(c.old_status)} to <span style={{ color: "var(--gold)" }}>{statusLabel(c.new_status)}</span>
                          </span>
                          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                            {c.fine_type}. {new Date(c.changed_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}, by {c.changed_by_email}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
