"use client";

import type { AuditLog } from "@/lib/types";

export default function AuditTab({ auditLogs }: { auditLogs: AuditLog[] }) {
  const now = new Date();
  const nextReset = new Date(Date.UTC(
    now.getUTCMonth() === 0 && now.getUTCDate() >= 4 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(),
    0, 4, 23, 59, 0
  ));
  if (now >= nextReset) nextReset.setUTCFullYear(nextReset.getUTCFullYear() + 1);
  const diff = nextReset.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <>
      <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#F87171", fontSize: 13, fontWeight: 600 }}>⚠ Annual Reset:</span>
        <span style={{ color: "#F87171", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
          {days}d {hours}h {mins}m until all fines are deleted (Jan 4)
        </span>
      </div>
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
    </>
  );
}
