"use client";

import { useState, useEffect } from "react";
import type { Fine, Member } from "@/lib/types";

interface MembersTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  refresh: () => Promise<void>;
}

export default function MembersTab({ members, fines, isPrivileged, refresh }: MembersTabProps) {
  const [memberForm, setMemberForm] = useState({
    name: "",
    status: "active" as Member["status"],
    roll: "",
    big_brother_roll: null as number | null,
    big_brother_name: "" as string,
  });
  const [bbSearch, setBbSearch] = useState("");
  const [bbResults, setBbResults] = useState<Array<{ roll: number; name: string; initiation_class: string | null }>>([]);
  const [showBbSuggestions, setShowBbSuggestions] = useState(false);
  const [rosterMap, setRosterMap] = useState<Map<number, { name: string; big_brother_roll: number | null }>>(new Map());

  useEffect(() => {
    const q = bbSearch.trim();
    if (!q || memberForm.big_brother_roll != null) {
      setBbResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/roster/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setBbResults([]);
          return;
        }
        const data = await res.json();
        setBbResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setBbResults([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [bbSearch, memberForm.big_brother_roll]);

  useEffect(() => {
    fetch("/api/admin/roster")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.entries)) {
          setRosterMap(
            new Map(d.entries.map((e: { roll: number; name: string; big_brother_roll: number | null }) => [e.roll, { name: e.name, big_brother_roll: e.big_brother_roll }]))
          );
        }
      })
      .catch(() => {});
  }, []);

  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [editingRollId, setEditingRollId] = useState<string | null>(null);
  const [rollDraft, setRollDraft] = useState("");
  const [rollSaving, setRollSaving] = useState(false);
  const [rollError, setRollError] = useState("");

  const [editingBbId, setEditingBbId] = useState<string | null>(null);
  const [bbEditSearch, setBbEditSearch] = useState("");
  const [bbEditPickRoll, setBbEditPickRoll] = useState<number | null>(null);
  const [bbEditPickName, setBbEditPickName] = useState("");
  const [bbEditResults, setBbEditResults] = useState<Array<{ roll: number; name: string; initiation_class: string | null }>>([]);
  const [showBbEditSuggestions, setShowBbEditSuggestions] = useState(false);
  const [bbEditSaving, setBbEditSaving] = useState(false);
  const [bbEditError, setBbEditError] = useState("");

  useEffect(() => {
    if (editingBbId == null) return;
    const q = bbEditSearch.trim();
    if (!q || bbEditPickRoll != null) {
      setBbEditResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/roster/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setBbEditResults([]);
          return;
        }
        const data = await res.json();
        setBbEditResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setBbEditResults([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [bbEditSearch, bbEditPickRoll, editingBbId]);

  function startEditBb(m: Member) {
    setEditingBbId(m.id);
    const rosterEntry = m.roll != null ? rosterMap.get(m.roll) : null;
    const currentBbRoll = rosterEntry?.big_brother_roll ?? null;
    if (currentBbRoll != null) {
      const bbEntry = rosterMap.get(currentBbRoll);
      setBbEditPickRoll(currentBbRoll);
      setBbEditPickName(bbEntry?.name ?? "");
    } else {
      setBbEditPickRoll(null);
      setBbEditPickName("");
    }
    setBbEditSearch("");
    setBbEditResults([]);
    setBbEditError("");
  }

  function cancelEditBb() {
    setEditingBbId(null);
    setBbEditSearch("");
    setBbEditPickRoll(null);
    setBbEditPickName("");
    setBbEditResults([]);
    setBbEditError("");
  }

  async function refreshRosterMap() {
    try {
      const r = await fetch("/api/admin/roster");
      const d = await r.json();
      if (Array.isArray(d.entries)) {
        setRosterMap(
          new Map(d.entries.map((e: { roll: number; name: string; big_brother_roll: number | null }) => [e.roll, { name: e.name, big_brother_roll: e.big_brother_roll }]))
        );
      }
    } catch {}
  }

  async function saveBb(memberId: string) {
    setBbEditSaving(true);
    setBbEditError("");
    const res = await fetch(`/api/admin/members/${memberId}/big-bro`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ big_brother_roll: bbEditPickRoll }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBbEditError(data.error ?? `HTTP ${res.status}`);
    } else {
      cancelEditBb();
      await refreshRosterMap();
      await refresh();
    }
    setBbEditSaving(false);
  }

  function startEditRoll(m: Member) {
    setEditingRollId(m.id);
    setRollDraft(m.roll != null ? String(m.roll) : "");
    setRollError("");
  }

  function cancelEditRoll() {
    setEditingRollId(null);
    setRollDraft("");
    setRollError("");
  }

  async function saveRoll(id: string) {
    setRollSaving(true);
    setRollError("");
    const trimmed = rollDraft.trim();
    const parsed = trimmed === "" ? null : parseInt(trimmed, 10);
    const res = await fetch(`/api/admin/members/${id}/roll`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roll: parsed }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRollError(data.error ?? "Failed to update Roll #");
    } else {
      setEditingRollId(null);
      setRollDraft("");
      await refresh();
    }
    setRollSaving(false);
  }

  async function submitMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberSubmitting(true);
    setMemberError("");

    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: memberForm.name.trim(),
        status: memberForm.status,
        roll: memberForm.roll,
        big_brother_roll: memberForm.big_brother_roll,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setMemberError(data.error ?? "Failed to add member");
    } else {
      setMemberForm({ name: "", status: "active", roll: "", big_brother_roll: null, big_brother_name: "" });
      setBbSearch("");
      setBbResults([]);
      await refresh();
    }
    setMemberSubmitting(false);
  }

  async function updateMemberStatus(id: string, status: Member["status"]) {
    const res = await fetch(`/api/admin/members/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await refresh();
  }

  async function deleteMember(id: string) {
    if (!confirm("Delete this member and all their fines?")) return;
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  return (
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
            <div style={{ position: "relative", minWidth: 220 }}>
              <label className="adm-label">Big Brother (optional)</label>
              {memberForm.big_brother_roll != null ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    className="adm-input"
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", paddingRight: 8 }}
                  >
                    {memberForm.big_brother_name} <span style={{ color: "var(--text-dim)", marginLeft: 6, fontSize: 12 }}>#{memberForm.big_brother_roll}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMemberForm({ ...memberForm, big_brother_roll: null, big_brother_name: "" });
                      setBbSearch("");
                      setBbResults([]);
                    }}
                    aria-label="Clear big brother"
                    title="Clear"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 4, fontSize: 16, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={bbSearch}
                    onChange={(e) => {
                      setBbSearch(e.target.value);
                      setShowBbSuggestions(true);
                    }}
                    onFocus={() => setShowBbSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowBbSuggestions(false), 150)}
                    placeholder="Search roster…"
                    className="adm-input"
                    autoComplete="off"
                    style={{ width: "100%" }}
                  />
                  {showBbSuggestions && bbResults.length > 0 && (
                    <ul className="adm-suggestions">
                      {bbResults.map((r) => (
                        <li key={r.roll}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setMemberForm({
                                ...memberForm,
                                big_brother_roll: r.roll,
                                big_brother_name: r.name,
                              });
                              setBbSearch("");
                              setBbResults([]);
                              setShowBbSuggestions(false);
                            }}
                            className="adm-suggestion-btn"
                          >
                            <span className="adm-suggestion-name">{r.name}</span>
                            <span className="adm-suggestion-status">
                              #{r.roll}{r.initiation_class ? ` · ${r.initiation_class}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
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
                <th>Big Bro</th>
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
                    <td style={{ fontWeight: 500 }}>
                      {m.name}
                    </td>
                    <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: m.roll ? "var(--gold)" : "var(--text-dim)" }}>
                      {editingRollId === m.id ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            min={1}
                            max={99999}
                            value={rollDraft}
                            onChange={(e) => setRollDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveRoll(m.id); }
                              else if (e.key === "Escape") { e.preventDefault(); cancelEditRoll(); }
                            }}
                            disabled={rollSaving}
                            autoFocus
                            className="adm-input"
                            style={{ width: 70, padding: "2px 6px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}
                            placeholder="—"
                          />
                          <button
                            type="button"
                            onClick={() => saveRoll(m.id)}
                            disabled={rollSaving}
                            aria-label="Save Roll #"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--gold)", padding: 2, fontSize: 14, lineHeight: 1 }}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditRoll}
                            disabled={rollSaving}
                            aria-label="Cancel"
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, fontSize: 14, lineHeight: 1 }}
                          >
                            ✕
                          </button>
                          {rollError && (
                            <span className="adm-error" style={{ fontSize: 11, marginLeft: 4 }}>{rollError}</span>
                          )}
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {m.roll ?? "—"}
                          {isPrivileged && (
                            <button
                              type="button"
                              onClick={() => startEditRoll(m)}
                              aria-label="Edit Roll #"
                              title="Edit Roll #"
                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, display: "inline-flex", alignItems: "center" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                      {editingBbId === m.id ? (
                        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
                          {bbEditPickRoll != null ? (
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <span style={{ flex: 1 }}>
                                {bbEditPickName} <span style={{ color: "var(--gold)" }}>#{bbEditPickRoll}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => { setBbEditPickRoll(null); setBbEditPickName(""); }}
                                aria-label="Clear big brother"
                                title="Clear"
                                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, fontSize: 14, lineHeight: 1 }}
                              >×</button>
                            </div>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={bbEditSearch}
                                onChange={(e) => { setBbEditSearch(e.target.value); setShowBbEditSuggestions(true); }}
                                onFocus={() => setShowBbEditSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowBbEditSuggestions(false), 150)}
                                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancelEditBb(); } }}
                                placeholder="Search roster…"
                                className="adm-input"
                                style={{ width: "100%", padding: "2px 6px", fontSize: 12 }}
                                autoComplete="off"
                                autoFocus
                              />
                              {showBbEditSuggestions && bbEditResults.length > 0 && (
                                <ul className="adm-suggestions">
                                  {bbEditResults.map((r) => (
                                    <li key={r.roll}>
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setBbEditPickRoll(r.roll);
                                          setBbEditPickName(r.name);
                                          setBbEditSearch("");
                                          setBbEditResults([]);
                                          setShowBbEditSuggestions(false);
                                        }}
                                        className="adm-suggestion-btn"
                                      >
                                        <span className="adm-suggestion-name">{r.name}</span>
                                        <span className="adm-suggestion-status">
                                          #{r.roll}{r.initiation_class ? ` · ${r.initiation_class}` : ""}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </>
                          )}
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => saveBb(m.id)}
                              disabled={bbEditSaving}
                              aria-label="Save Big Brother"
                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--gold)", padding: 2, fontSize: 14, lineHeight: 1 }}
                            >✓</button>
                            <button
                              type="button"
                              onClick={cancelEditBb}
                              disabled={bbEditSaving}
                              aria-label="Cancel"
                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, fontSize: 14, lineHeight: 1 }}
                            >✕</button>
                            {bbEditError && (
                              <span className="adm-error" style={{ fontSize: 11, marginLeft: 4 }}>{bbEditError}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {(() => {
                            const rosterEntry = m.roll != null ? rosterMap.get(m.roll) : null;
                            const bbRoll = rosterEntry?.big_brother_roll;
                            if (!bbRoll) return <span>—</span>;
                            const bbEntry = rosterMap.get(bbRoll);
                            return bbEntry ? <span>{bbEntry.name} <span style={{ color: "var(--gold)", marginLeft: 4 }}>#{bbRoll}</span></span> : <span style={{ color: "var(--gold)" }}>#{bbRoll}</span>;
                          })()}
                          {isPrivileged && m.roll != null && (
                            <button
                              type="button"
                              onClick={() => startEditBb(m)}
                              aria-label="Edit Big Brother"
                              title="Edit Big Brother"
                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0, display: "inline-flex", alignItems: "center" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                          )}
                        </span>
                      )}
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
  );
}
