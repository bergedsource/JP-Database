"use client";

import { useEffect, useState } from "react";
import type { SocialProbationHistory } from "@/lib/types";
import { sheetSafe } from "@/lib/sheet-safe";

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function csvCell(v: string): string {
  const safe = sheetSafe(v);
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export default function SocProHistoryTab() {
  const [rows, setRows] = useState<SocialProbationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/social-probation/history")
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setRows(d);
        else setError(d.error ?? "Failed to load history");
      })
      .catch(() => { if (!cancelled) setError("Failed to load history"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const reasons = Array.from(new Set(rows.map((r) => r.reason))).sort();
  const filtered = rows.filter((r) =>
    (reason === "all" || r.reason === reason) &&
    r.member_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  function exportCsv() {
    const headers = ["Member", "Reason", "Start Date", "Expected End", "Removed", "How Removed", "Removed By", "Source", "Notes"];
    const lines = filtered.map((r) => [
      r.member_name, r.reason, r.start_date, r.end_date ?? "", r.removed_at.split("T")[0],
      r.removal_reason, r.removed_by, r.source, r.notes ?? "",
    ].map(csvCell).join(","));
    // BOM so Excel reads UTF-8 (the § in reasons) correctly
    const blob = new Blob(["﻿" + [headers.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soc-pro-history-${new Date().toLocaleDateString("en-CA")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="adm-filters" style={{ marginBottom: 0 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search member…"
          className="adm-input"
          style={{ width: 200 }}
        />
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="adm-input" style={{ width: "auto" }}>
          <option value="all">All reasons</option>
          {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="button" className="adm-btn" onClick={exportCsv} disabled={filtered.length === 0} style={{ padding: "6px 14px", fontSize: 12, marginLeft: "auto" }}>
          Export to Excel / Sheets (.csv)
        </button>
      </div>

      <div className="adm-card">
        <div className="adm-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="adm-card-title">Past Soc Pro</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-sans), sans-serif" }}>
            {filtered.length} entr{filtered.length !== 1 ? "ies" : "y"}
          </span>
        </div>
        {loading ? (
          <p className="adm-empty">Loading…</p>
        ) : error ? (
          <p className="adm-error" style={{ margin: 16 }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p className="adm-empty">{rows.length === 0 ? "No one has come off soc pro since history tracking started." : "No entries match."}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Reason</th>
                  <th>Start</th>
                  <th>Expected End</th>
                  <th>Removed</th>
                  <th>How</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.member_name}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.reason}</td>
                    <td style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(r.start_date)}</td>
                    <td style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(r.end_date) || "—"}</td>
                    <td style={{ fontFamily: "var(--font-sans), sans-serif", fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(r.removed_at)}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {r.removal_reason}
                      <span style={{ display: "block", fontSize: 10, color: "var(--text-dim)" }}>{r.removed_by}</span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-dim)" }}>{r.notes ?? "—"}</td>
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
