"use client";

import { useState } from "react";
import type { Fine, FineStatus, FineType, Member } from "@/lib/types";
import { FINE_TYPES, FINE_DESCRIPTIONS } from "@/lib/fine-types";

const STATUS_COLORS: Record<FineStatus, { bg: string; color: string; border: string }> = {
  pending:    { bg: "rgba(251,191,36,0.1)",   color: "#FCD34D", border: "rgba(251,191,36,0.3)" },
  upheld:     { bg: "rgba(239,68,68,0.1)",    color: "#F87171", border: "rgba(239,68,68,0.3)" },
  overturned: { bg: "rgba(251,146,60,0.1)",   color: "#FB923C", border: "rgba(251,146,60,0.3)" },
  dismissed:  { bg: "rgba(52,211,153,0.1)",   color: "#34D399", border: "rgba(52,211,153,0.3)" },
  paid:       { bg: "rgba(96,165,250,0.1)",   color: "#60A5FA", border: "rgba(96,165,250,0.3)" },
  labor:      { bg: "rgba(167,139,250,0.1)",  color: "#A78BFA", border: "rgba(167,139,250,0.3)" },
};

function getTermOptions(): string[] {
  const year = new Date().getFullYear();
  return [`Winter ${year}`, `Spring ${year}`, `Summer ${year}`, `Fall ${year}`];
}

function getCurrentTerm(): string {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  if (month <= 3) return `Winter ${year}`;
  if (month <= 6) return `Spring ${year}`;
  if (month <= 8) return `Summer ${year}`;
  return `Fall ${year}`;
}

interface OutstandingTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  currentUserId: string | null;
  userRole: "owner" | "admin" | "root" | null;
  refresh: () => Promise<void>;
}

export default function OutstandingTab({ members, fines, isPrivileged, currentUserId, userRole, refresh }: OutstandingTabProps) {
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

  // Filter state
  const [filterTerm, setFilterTerm] = useState<string>("all");

  // Amount editing state
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editingAmountValue, setEditingAmountValue] = useState<string>("");

  async function submitOutstandingFine(e: React.FormEvent) {
    e.preventDefault();
    if (!outSelectedMember) { setOutError("Select a member."); return; }
    setOutSubmitting(true);
    setOutError("");

    const res = await fetch("/api/admin/fines/outstanding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        member_id: outSelectedMember.id,
        member_name: outSelectedMember.name,
        fine_type: outForm.fine_type,
        description: outForm.description,
        amount: outForm.amount,
        term: outForm.term,
        date_issued: outForm.date_issued,
        notes: outForm.notes,
        place_on_soc_pro: outForm.place_on_soc_pro,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      setOutError(d.error ?? "Failed to add outstanding fine");
      setOutSubmitting(false);
      return;
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
    await refresh();
    setOutSubmitting(false);
  }

  async function updateFineStatus(id: string, status: FineStatus) {
    await fetch(`/api/admin/fines/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  async function updateFineAmount(id: string, newAmount: number | null) {
    await fetch(`/api/admin/fines/${id}/amount`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: newAmount }),
    });
    setEditingAmountId(null);
    setEditingAmountValue("");
    await refresh();
  }

  const outstandingFines = fines.filter((f) => {
    if (f.status !== "pending" && f.status !== "upheld") return false;
    if (filterTerm !== "all" && f.term !== filterTerm) return false;
    return true;
  });
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
      {isPrivileged && <div className="adm-card">
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
            {isPrivileged && (
              <button type="submit" disabled={outSubmitting} className="adm-btn">
                {outSubmitting ? "Adding…" : "Add Outstanding Fine"}
              </button>
            )}
          </form>
        </div>
      </div>}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>Term</label>
          <select
            value={filterTerm}
            onChange={(e) => setFilterTerm(e.target.value)}
            className="adm-input"
            style={{ padding: "4px 8px", fontSize: 12, width: "auto" }}
          >
            <option value="all">All Terms</option>
            {getTermOptions().map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="adm-summary">
        <span style={{ color: "var(--text-muted)" }}>
          {outstandingFines.length} outstanding fine{outstandingFines.length !== 1 ? "s" : ""} · {byMember.length} member{byMember.length !== 1 ? "s" : ""}
          {filterTerm !== "all" && <span style={{ color: "var(--gold)", marginLeft: 6 }}>· {filterTerm}</span>}
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
                      {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}{fine.fining_officer ? ` · Officer: ${fine.fining_officer}` : ""}
                      {editingAmountId === fine.id ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                          · $<input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingAmountValue}
                            onChange={(e) => setEditingAmountValue(e.target.value)}
                            autoFocus
                            style={{ width: 70, background: "var(--surface-2)", border: "1px solid var(--gold)", borderRadius: 4, color: "var(--text)", fontSize: 12, padding: "1px 4px", fontFamily: "'IBM Plex Mono', monospace" }}
                          />
                          <button onClick={() => updateFineAmount(fine.id, editingAmountValue ? parseFloat(editingAmountValue) : null)} style={{ background: "none", border: "none", color: "var(--gold)", cursor: "pointer", fontSize: 13, padding: "0 2px" }}>✓</button>
                          <button onClick={() => { setEditingAmountId(null); setEditingAmountValue(""); }} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 13, padding: "0 2px" }}>✗</button>
                        </span>
                      ) : (
                        <>
                          {fine.amount != null && ` · $${fine.amount.toFixed(2)}`}
                          {(isPrivileged || fine.created_by_user_id === currentUserId) && (
                            <button
                              onClick={() => { setEditingAmountId(fine.id); setEditingAmountValue(fine.amount?.toString() ?? ""); }}
                              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 11, padding: "0 4px", marginLeft: 2, fontFamily: "'IBM Plex Mono', monospace" }}
                              title="Edit amount"
                            >edit</button>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                    <span className="adm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                      {fine.status}
                    </span>
                    {isPrivileged ? (
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
}
