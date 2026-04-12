"use client";

import type { AuditLog } from "@/lib/types";

export default function EventsTab({ eventLog }: { eventLog: AuditLog[] }) {
  return (
    <div className="adm-card">
      {eventLog.length === 0 ? (
        <p className="adm-empty">No creator actions recorded yet.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {eventLog.map((log) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
                  {new Date(log.created_at).toLocaleDateString()}{" "}
                  <span style={{ color: "var(--text-dim)" }}>
                    {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </td>
                <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{log.action}</td>
                <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
