"use client";

import { useCallback, useEffect, useState } from "react";
import type { TicketsSoFarResponse } from "@/app/api/admin/tickets/route";

const POLL_MS = 15000;
const STATUS_LABEL: Record<string, string> = { waiting: "Waiting", here: "Here", called: "Called", skipped: "Skipped", done: "Done" };

// Read-only list of tickets taken for the next JP night, shown on the Sessions list
// before the session is started (the live Queue takes over once it is).
export default function TicketsSoFar() {
  const [data, setData] = useState<TicketsSoFarResponse | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      fetch("/api/admin/tickets", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setData(d); })
        .catch(() => {}),
    []
  );

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Two taps: the first arms "Tap again to cancel", the second cancels.
  async function cancel(id: string) {
    if (confirmId !== id) { setConfirmId(id); return; }
    setConfirmId(null);
    setBusyId(id);
    setError("");
    const res = await fetch("/api/admin/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't cancel. Try again.");
    }
    await load();
    setBusyId(null);
  }

  if (!data?.date) return null;
  const night = new Date(`${data.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="adm-card">
      <div className="adm-card-header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "4px 16px" }}>
        <span className="adm-card-title">Tickets so far</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{night} · {data.tickets.length} ticket{data.tickets.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="adm-card-body">
        {error && <p className="adm-empty" role="alert" style={{ color: "var(--red)", padding: "0 0 12px" }}>{error}</p>}
        {data.tickets.length === 0 ? (
          <p className="adm-empty">No one has taken a ticket yet.</p>
        ) : (
          <ul className="ses-queue-list">
            {data.tickets.map((t) => (
              <li key={t.id} className="ses-queue-row">
                <span className="ses-queue-roll">{t.roll != null ? `#${t.roll}` : "–"}</span>
                <span className="ses-queue-who">
                  <span className="ses-queue-name">{t.name}</span>
                  <span className="ses-queue-meta">
                    {t.no ? `Ticket #${t.no}, ` : ""}for {t.officer}
                    {t.proxyName ? `, proxy: ${t.proxyName}` : ""}
                    {t.phone ? <>, <a href={`tel:${t.phone}`}>{t.contact}</a></> : t.contact ? `, ${t.contact}` : ""}
                  </span>
                </span>
                <span className={`ses-queue-status s-${t.status}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                {t.status !== "done" && (
                  <span className="ses-queue-actions">
                    {t.phone && (
                      <>
                        <a className="ses-choice" href={`tel:${t.phone}`}>Call</a>
                        <a className="ses-choice" href={`sms:${t.phone}`}>Text</a>
                      </>
                    )}
                    <button
                      type="button"
                      className="ses-choice"
                      disabled={busyId === t.id}
                      onClick={() => cancel(t.id)}
                      onBlur={() => setConfirmId((c) => (c === t.id ? null : c))}
                    >
                      {busyId === t.id ? "Cancelling…" : confirmId === t.id ? "Tap again to cancel" : "Cancel ticket"}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
