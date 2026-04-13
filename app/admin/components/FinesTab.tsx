"use client";

import { useState, useEffect } from "react";
import type { Fine, FineStatus, FineType, Member } from "@/lib/types";
import { FINE_TYPES, FINE_DEFAULT_AMOUNTS, FINE_DESCRIPTIONS } from "@/lib/fine-types";

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

interface FinesTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  currentUserId: string | null;
  userRole: "owner" | "admin" | "root" | null;
  refresh: () => Promise<void>;
}

export default function FinesTab({ members, fines, isPrivileged, currentUserId, userRole, refresh }: FinesTabProps) {
  // Filter state
  const [filterStatus, setFilterStatus] = useState<FineStatus | "all">("all");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [filterOfficer, setFilterOfficer] = useState<string>("all");
  const [filterTerm, setFilterTerm] = useState<string>("all");

  // Fine form state
  const [fineForm, setFineForm] = useState({
    fine_type: "General Misconduct (§11-020)" as FineType,
    description: "",
    amount: "",
    term: getCurrentTerm(),
    date_issued: new Date().toISOString().split("T")[0],
    notes: "",
    fining_officer: "",
  });
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [fineSubmitting, setFineSubmitting] = useState(false);
  const [fineError, setFineError] = useState("");
  const [officerSearch, setOfficerSearch] = useState("");
  const [showOfficerSuggestions, setShowOfficerSuggestions] = useState(false);

  // Amount editing state
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editingAmountValue, setEditingAmountValue] = useState<string>("");

  // Custom fine types
  const [customFineTypes, setCustomFineTypes] = useState<{ id: string; name: string; bylaw_number: string; default_amount: number | null; description: string | null }[]>([]);
  const [showAddBylaw, setShowAddBylaw] = useState(false);
  const [bylawForm, setBylawForm] = useState({ name: "", bylaw_number: "", default_amount: "", description: "" });
  const [bylawSubmitting, setBylawSubmitting] = useState(false);
  const [bylawError, setBylawError] = useState("");

  useEffect(() => {
    loadCustomFineTypes();
  }, []);

  async function loadCustomFineTypes() {
    fetch("/api/admin/fine-types")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setCustomFineTypes(d); })
      .catch(() => {});
  }

  async function submitFine(e: React.FormEvent) {
    e.preventDefault();
    if (selectedMembers.length === 0) { setFineError("Select at least one member."); return; }
    if (!fineForm.fining_officer) { setFineError("Select a fining officer."); return; }
    setFineSubmitting(true);
    setFineError("");

    const res = await fetch("/api/admin/fines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        members: selectedMembers.map(m => ({ id: m.id, name: m.name })),
        fine_type: fineForm.fine_type,
        description: fineForm.description,
        amount: fineForm.amount,
        term: fineForm.term,
        date_issued: fineForm.date_issued,
        notes: fineForm.notes,
        fining_officer: fineForm.fining_officer,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      setFineError(d.error ?? "Failed to issue fine");
    } else {
      setFineForm({
        fine_type: "General Misconduct (§11-020)",
        description: "",
        amount: "",
        term: getCurrentTerm(),
        date_issued: new Date().toISOString().split("T")[0],
        notes: "",
        fining_officer: "",
      });
      setOfficerSearch("");
      setSelectedMembers([]);
      setMemberSearch("");
      await refresh();
    }
    setFineSubmitting(false);
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

  async function deleteFine(id: string) {
    if (!confirm("Delete this fine?")) return;
    await fetch(`/api/admin/fines/${id}`, { method: "DELETE" });
    await refresh();
  }

  const uniqueOfficers = Array.from(new Set(fines.map((f) => f.fining_officer).filter(Boolean))) as string[];

  const filteredFines = fines.filter((f) => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterMember !== "all" && f.member_id !== filterMember) return false;
    if (filterOfficer !== "all" && f.fining_officer !== filterOfficer) return false;
    if (filterTerm !== "all" && f.term !== filterTerm) return false;
    return true;
  });

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentFines = filteredFines.filter((f) => new Date(f.created_at) >= cutoff);
  const olderFines = filteredFines.filter((f) => new Date(f.created_at) < cutoff);

  const renderFineCard = (fine: Fine) => {
    const sc = STATUS_COLORS[fine.status] ?? { bg: "transparent", color: "#8B949E", border: "#30363D" };
    return (
      <div key={fine.id} className="adm-fine-row" style={{ borderLeftColor: sc.color }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="adm-fine-member">{fine.member_name}</span>
            <span style={{ color: "var(--text-dim)" }}>·</span>
            <span className="adm-fine-type">{fine.fine_type}</span>
          </div>
          <p className="adm-fine-desc">{fine.description}</p>
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
                    style={{ background: "rgba(207,181,59,0.12)", border: "1px solid rgba(207,181,59,0.35)", color: "var(--gold)", cursor: "pointer", fontSize: 11, padding: "1px 7px", marginLeft: 6, borderRadius: 4, fontFamily: "'IBM Plex Mono', monospace" }}
                    title="Edit amount"
                  >✎ edit</button>
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
              <option value="overturned">Overturned</option>
              <option value="paid">Paid</option>
              <option value="labor">Labor</option>
            </select>
          ) : (
            <span className="adm-status-badge" style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{fine.status}</span>
          )}
          {isPrivileged && (
            <button onClick={() => deleteFine(fine.id)} className="adm-delete-btn">Delete</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Issue Fine Form — owner only */}
      {isPrivileged && <div className="adm-card">
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
                  const custom = customFineTypes.find((c) => `${c.name} (§${c.bylaw_number})` === type);
                  const desc = custom?.description ?? FINE_DESCRIPTIONS[type] ?? "";
                  const defaultAmt = custom?.default_amount != null ? custom.default_amount : FINE_DEFAULT_AMOUNTS[type] ?? null;
                  const amount = defaultAmt != null ? String(defaultAmt) : "";
                  setFineForm({ ...fineForm, fine_type: type, description: desc, amount });
                }}
                className="adm-input"
              >
                {[
                  ...FINE_TYPES.map((t) => ({ label: t, value: t })),
                  ...customFineTypes.map((c) => ({ label: `${c.name} (§${c.bylaw_number})`, value: `${c.name} (§${c.bylaw_number})` })),
                ]
                  .sort((a, b) => a.label === "Other" ? 1 : b.label === "Other" ? -1 : a.label.localeCompare(b.label))
                  .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

            <div style={{ position: "relative" }}>
              <label className="adm-label">
                Fining Officer <span className="adm-req">*</span>
                {fineForm.fining_officer && (
                  <span style={{ color: "var(--gold)", marginLeft: 6, fontWeight: 600 }}>
                    {fineForm.fining_officer}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={fineForm.fining_officer ? fineForm.fining_officer : officerSearch}
                onChange={(e) => {
                  setFineForm({ ...fineForm, fining_officer: "" });
                  setOfficerSearch(e.target.value);
                  setShowOfficerSuggestions(true);
                }}
                onFocus={() => { if (!fineForm.fining_officer) setShowOfficerSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowOfficerSuggestions(false), 150)}
                placeholder="Search member…"
                autoComplete="off"
                className="adm-input"
              />
              {showOfficerSuggestions && officerSearch.trim() && !fineForm.fining_officer && (
                <ul className="adm-suggestions">
                  {members
                    .filter((m) =>
                      (m.status === "active" || m.status === "pledge") &&
                      m.name.toLowerCase().includes(officerSearch.toLowerCase())
                    )
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setFineForm({ ...fineForm, fining_officer: m.name });
                            setOfficerSearch("");
                            setShowOfficerSuggestions(false);
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
            </div>

            {fineError && (
              <p className="adm-error" style={{ gridColumn: "span 2" }}>{fineError}</p>
            )}

            <div style={{ gridColumn: "span 2" }}>
              {isPrivileged && (
                <button type="submit" disabled={fineSubmitting} className="adm-btn">
                  {fineSubmitting ? "Issuing…" : "Issue Fine"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>}

      {/* Add Custom Bylaw */}
      {isPrivileged && (
        <div className="adm-card">
          <div className="adm-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="adm-card-title">Add New Bylaw</span>
            <button className="adm-btn" style={{ padding: "4px 14px", fontSize: 13 }} onClick={() => { setShowAddBylaw((v) => !v); setBylawError(""); }}>
              {showAddBylaw ? "Cancel" : "+ Add Bylaw"}
            </button>
          </div>
          {showAddBylaw && (
            <div className="adm-card-body">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBylawSubmitting(true);
                  setBylawError("");
                  const res = await fetch("/api/admin/fine-types", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: bylawForm.name,
                      bylaw_number: bylawForm.bylaw_number,
                      default_amount: bylawForm.default_amount ? parseFloat(bylawForm.default_amount) : null,
                      description: bylawForm.description,
                    }),
                  });
                  const data = await res.json();
                  setBylawSubmitting(false);
                  if (!res.ok) { setBylawError(data.error ?? "Failed to add bylaw"); return; }
                  setCustomFineTypes((prev) => [...prev, data]);
                  setBylawForm({ name: "", bylaw_number: "", default_amount: "", description: "" });
                  setShowAddBylaw(false);
                }}
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
              >
                <div>
                  <label className="adm-label">Fine Name <span className="adm-req">*</span></label>
                  <input className="adm-input" required value={bylawForm.name} onChange={(e) => setBylawForm({ ...bylawForm, name: e.target.value })} placeholder="e.g. Missing Study Hours" />
                </div>
                <div>
                  <label className="adm-label">Bylaw # <span className="adm-req">*</span></label>
                  <input className="adm-input" required value={bylawForm.bylaw_number} onChange={(e) => setBylawForm({ ...bylawForm, bylaw_number: e.target.value })} placeholder="e.g. 11-310" />
                </div>
                <div>
                  <label className="adm-label">Default Fine Amount <span className="adm-opt">optional</span></label>
                  <input className="adm-input" type="number" min="0" step="0.01" value={bylawForm.default_amount} onChange={(e) => setBylawForm({ ...bylawForm, default_amount: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="adm-label">Summary of New Bylaw <span className="adm-req">*</span></label>
                  <input className="adm-input" required value={bylawForm.description} onChange={(e) => setBylawForm({ ...bylawForm, description: e.target.value })} placeholder="Summary of new bylaw" />
                </div>
                {bylawError && <p className="adm-error" style={{ gridColumn: "span 2" }}>{bylawError}</p>}
                <div style={{ gridColumn: "span 2" }}>
                  <button type="submit" disabled={bylawSubmitting} className="adm-btn">{bylawSubmitting ? "Adding…" : "Add Bylaw"}</button>
                </div>
              </form>
            </div>
          )}
          {customFineTypes.length > 0 && (
            <div className="adm-card-body" style={{ paddingTop: showAddBylaw ? 0 : undefined }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Fine Name</th>
                    <th>Bylaw #</th>
                    <th>Default Amount</th>
                    <th>Description</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {customFineTypes.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>§{c.bylaw_number}</td>
                      <td>{c.default_amount != null ? `$${Number(c.default_amount).toFixed(2)}` : <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                      <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{c.description ?? <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                      <td>
                        <button
                          className="adm-btn-danger"
                          style={{ padding: "2px 10px", fontSize: 12 }}
                          onClick={async () => {
                            if (!confirm(`Remove "${c.name} (§${c.bylaw_number})" from the fine list?`)) return;
                            await fetch("/api/admin/fine-types", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }) });
                            setCustomFineTypes((prev) => prev.filter((x) => x.id !== c.id));
                          }}
                        >Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
          <option value="overturned">Overturned</option>
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
        <select
          value={filterOfficer}
          onChange={(e) => setFilterOfficer(e.target.value)}
          className="adm-input"
          style={{ width: "auto" }}
        >
          <option value="all">All officers</option>
          {uniqueOfficers.sort().map((officer) => (
            <option key={officer} value={officer}>{officer}</option>
          ))}
        </select>
        <select
          value={filterTerm}
          onChange={(e) => setFilterTerm(e.target.value)}
          className="adm-input"
          style={{ width: "auto" }}
        >
          <option value="all">All terms</option>
          {getTermOptions().map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
          {filteredFines.length} fine{filteredFines.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Fines List */}
      {filteredFines.length === 0 ? (
        <div className="adm-card"><p className="adm-empty">No fines found.</p></div>
      ) : (
        <>
          {recentFines.length > 0 && (
            <div className="adm-card">
              <div className="adm-card-header">
                <span className="adm-card-title" style={{ fontSize: 13 }}>Recent — last 14 days</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>{recentFines.length} fine{recentFines.length !== 1 ? "s" : ""}</span>
              </div>
              {recentFines.map(renderFineCard)}
            </div>
          )}
          {olderFines.length > 0 && (
            <div className="adm-card">
              <div className="adm-card-header">
                <span className="adm-card-title" style={{ fontSize: 13, color: "var(--text-dim)" }}>Older than 14 days</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>{olderFines.length} fine{olderFines.length !== 1 ? "s" : ""}</span>
              </div>
              {olderFines.map(renderFineCard)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
