"use client";

import { useState } from "react";
import type { Fine } from "@/lib/types";
import { daysOverdue } from "@/lib/overdue";

export const OVERDUE_ROW_STYLE = { borderLeftColor: "var(--red)", background: "#FFFFFF" };

interface OverdueActionsProps {
  fine: Fine;
  now: number;
  isPrivileged: boolean;
  refresh: () => Promise<void>;
}

// Badge + "Uphold" / "+1 week" for a pending fine past its review deadline.
export default function OverdueActions({ fine, now, isPrivileged, refresh }: OverdueActionsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(url: string, body?: object) {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method: "PUT",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed");
    }
    await refresh();
    setBusy(false);
  }

  const days = daysOverdue(fine, now);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <span className="adm-status-badge" style={{ background: "#FFFFFF", color: "var(--red)", borderColor: "#D73F09", fontWeight: 700 }}>
        overdue · {days}d
      </span>
      {isPrivileged && (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="adm-btn" disabled={busy} onClick={() => act(`/api/admin/fines/${fine.id}/status`, { status: "upheld" })} style={{ padding: "4px 10px", fontSize: 12, background: "var(--red)", color: "#fff" }}>
            Uphold
          </button>
          <button type="button" className="adm-btn" disabled={busy} onClick={() => act(`/api/admin/fines/${fine.id}/extend`)} style={{ padding: "4px 10px", fontSize: 12, background: "transparent", color: "var(--text)", border: "1px solid var(--border)" }}>
            +1 week
          </button>
        </div>
      )}
      {error && <span style={{ fontSize: 11, color: "var(--red)", maxWidth: 220, textAlign: "right" }}>{error}</span>}
    </div>
  );
}
