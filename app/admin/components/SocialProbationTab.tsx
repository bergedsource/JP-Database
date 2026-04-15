"use client";

import { useState } from "react";
import type { Member, SocialProbation, SocialProbationReason } from "@/lib/types";

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

interface SocialProbationTabProps {
  members: Member[];
  socialProbations: SocialProbation[];
  isPrivileged: boolean;
  refresh: () => Promise<void>;
}

export default function SocialProbationTab({ members, socialProbations, isPrivileged, refresh }: SocialProbationTabProps) {
  const [spForm, setSpForm] = useState({
    reason: "Outstanding Fines (§10-270)" as SocialProbationReason,
    notes: "",
    start_date: new Date().toISOString().split("T")[0],
  });
  const [spMemberSearch, setSpMemberSearch] = useState("");
  const [spSelectedMember, setSpSelectedMember] = useState<Member | null>(null);
  const [showSpSuggestions, setShowSpSuggestions] = useState(false);
  const [spSubmitting, setSpSubmitting] = useState(false);
  const [spError, setSpError] = useState("");

  const activeSP = socialProbations.filter((sp) => !sp.end_date);
  const spMemberSuggestions = members
    .filter((m) => ["active", "pledge"].includes(m.status) && m.name.toLowerCase().includes(spMemberSearch.toLowerCase()))
    .slice(0, 8);

  async function addSocialProbation(e: React.FormEvent) {
    e.preventDefault();
    if (!spSelectedMember) { setSpError("Select a member."); return; }
    setSpSubmitting(true);
    setSpError("");

    const res = await fetch("/api/admin/social-probation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        member_id: spSelectedMember.id,
        member_name: spSelectedMember.name,
        reason: spForm.reason,
        notes: spForm.notes,
        start_date: spForm.start_date,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setSpError(data.error ?? "Failed to add social probation");
    } else {
      setSpSelectedMember(null);
      setSpMemberSearch("");
      setSpForm({ reason: "Outstanding Fines (§10-270)", notes: "", start_date: new Date().toISOString().split("T")[0] });
      await refresh();
    }
    setSpSubmitting(false);
  }

  async function removeSocialProbation(id: string) {
    const res = await fetch(`/api/admin/social-probation/${id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

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
                      <button onClick={() => removeSocialProbation(sp.id)} className="adm-delete-btn">
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
}
