"use client";

import { useState } from "react";
import type { Fine, Member } from "@/lib/types";

const LABOR_COLOR = "#A78BFA";

function getTermOptions(): string[] {
  const year = new Date().getFullYear();
  return [`Winter ${year}`, `Spring ${year}`, `Summer ${year}`, `Fall ${year}`];
}

interface LaborTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  refresh: () => Promise<void>;
}

export default function LaborTab({ members, fines, isPrivileged, refresh }: LaborTabProps) {
  const [filterTerm, setFilterTerm] = useState<string>("all");

  // Labor completion — two-click confirm, since the row disappears with no undo
  const [confirmLaborId, setConfirmLaborId] = useState<string | null>(null);
  const [confirmIncompleteId, setConfirmIncompleteId] = useState<string | null>(null);
  const [laborBusyId, setLaborBusyId] = useState<string | null>(null);
  const [laborError, setLaborError] = useState("");

  async function completeLabor(id: string) {
    setLaborBusyId(id);
    setLaborError("");
    const res = await fetch(`/api/admin/fines/${id}/labor-complete`, { method: "PUT" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setLaborError(d.error ?? "Failed to mark labor complete");
    }
    setConfirmLaborId(null);
    await refresh();
    setLaborBusyId(null);
  }

  async function markNotCompleted(id: string) {
    setLaborBusyId(id);
    setLaborError("");
    const res = await fetch(`/api/admin/fines/${id}/labor-incomplete`, { method: "PUT" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setLaborError(d.error ?? "Failed to mark labor not completed");
    }
    setConfirmIncompleteId(null);
    await refresh();
    setLaborBusyId(null);
  }

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "Unknown";
  const laborRows = fines
    .filter((f) => f.status === "labor" && !f.labor_completed_at)
    .filter((f) => filterTerm === "all" || f.term === filterTerm)
    .sort((a, b) =>
      memberName(a.member_id).localeCompare(memberName(b.member_id)) ||
      a.date_issued.localeCompare(b.date_issued)
    );
  const memberCount = new Set(laborRows.map((f) => f.member_id)).size;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-sans), sans-serif" }}>Term</label>
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
          {laborRows.length} labor owed · {memberCount} member{memberCount !== 1 ? "s" : ""}
          {filterTerm !== "all" && <span style={{ color: "var(--gold)", marginLeft: 6 }}>· {filterTerm}</span>}
        </span>
      </div>

      {laborError && <p className="adm-error">{laborError}</p>}

      <div className="adm-card">
        <div className="adm-card-header">
          <span className="adm-card-title">On Labor</span>
        </div>
        <div className="adm-card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {laborRows.length === 0 ? (
            <p className="adm-empty">Nobody currently owes labor.</p>
          ) : (
            laborRows.map((fine) => (
              <div key={fine.id} className="adm-fine-row" style={{ borderLeftColor: LABOR_COLOR }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{memberName(fine.member_id)}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{fine.fine_type} — {fine.description}</p>
                  {fine.notes && <p className="adm-fine-notes">{fine.notes}</p>}
                  <p className="adm-fine-meta">
                    {new Date(fine.date_issued + "T12:00:00").toLocaleDateString()} · {fine.term}
                    {fine.amount != null && ` · in place of $${fine.amount.toFixed(2)}`}
                  </p>
                </div>
                {isPrivileged && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    {confirmLaborId === fine.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button type="button" className="adm-btn" disabled={laborBusyId === fine.id} onClick={() => completeLabor(fine.id)} style={{ padding: "4px 10px", fontSize: 12 }}>
                          {laborBusyId === fine.id ? "Saving…" : "Confirm"}
                        </button>
                        <button type="button" onClick={() => setConfirmLaborId(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 12 }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="adm-btn" onClick={() => { setConfirmLaborId(fine.id); setConfirmIncompleteId(null); }} style={{ padding: "4px 10px", fontSize: 12 }}>
                        Labor done
                      </button>
                    )}
                    {confirmIncompleteId === fine.id ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {fine.amount != null ? `${fine.amount.toFixed(2)} → ${(Math.round(fine.amount * 140) / 100).toFixed(2)}` : "No amount set"} · soc pro
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button type="button" className="adm-btn" disabled={laborBusyId === fine.id} onClick={() => markNotCompleted(fine.id)} style={{ padding: "4px 10px", fontSize: 12, background: "var(--red)", color: "#fff" }}>
                            {laborBusyId === fine.id ? "Saving…" : "Confirm"}
                          </button>
                          <button type="button" onClick={() => setConfirmIncompleteId(null)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 12 }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="adm-btn" onClick={() => { setConfirmIncompleteId(fine.id); setConfirmLaborId(null); }} style={{ padding: "4px 10px", fontSize: 12, background: "transparent", color: "var(--red)", border: "1px solid var(--red)" }}>
                        Not completed
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
