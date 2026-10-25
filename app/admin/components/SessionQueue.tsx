"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueueResponse, QueueRow } from "@/app/api/admin/sessions/[id]/queue/route";

const POLL_MS = 15000;
const TEXT_BODY = "JP: you're up in about 5 minutes. Head to JP now. – JP Chair";

const STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting",
  here: "Here",
  called: "Called",
  done: "Done",
  skipped: "Skipped",
};

// Tonight's docket in hearing order (officer groups, then roll #) with each brother's
// ticket, plus Call / Text links and the controls that drive everyone's wait estimate.
export default function SessionQueue({ sessionId, refreshKey }: { sessionId: string; refreshKey: number }) {
  const [q, setQ] = useState<QueueResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/sessions/${sessionId}/queue`, { cache: "no-store" });
    if (res.ok) setQ(await res.json());
  }, [sessionId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, POLL_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, refreshKey]);

  async function act(action: string, memberId?: string) {
    setBusy(memberId ?? action);
    setError("");
    const res = await fetch(`/api/admin/sessions/${sessionId}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, member_id: memberId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't update the queue.");
    }
    await load();
    setBusy(null);
  }

  if (!q || !q.open) return null;

  return (
    <details className="adm-card ses-queue" open>
      <summary className="adm-card-header ses-card-header">
        <span className="adm-card-title">Queue</span>
        <span className="ses-card-hint">
          {q.counts.tickets} ticket{q.counts.tickets !== 1 ? "s" : ""}, {q.counts.waiting} waiting, {q.counts.called} called
          {q.counts.skipped ? `, ${q.counts.skipped} skipped` : ""}
        </span>
      </summary>
      <div className="adm-card-body ses-queue-body">
        <div className="ses-queue-top">
          <p className="ses-queue-now">
            {q.nowHearing ? (
              <>Now hearing <strong>{q.nowHearing.name}</strong>{q.nowHearing.roll != null ? ` (#${q.nowHearing.roll})` : ""} in the {q.nowHearing.officer} group</>
            ) : (
              "Nobody left on the docket."
            )}
          </p>
          <button type="button" className="adm-btn" disabled={busy === "call-next" || q.counts.waiting === 0} onClick={() => act("call-next")}>
            Call next ticket
          </button>
        </div>
        {error && <p className="adm-error" role="alert">{error}</p>}

        {q.groups.map((g) => (
          <div key={g.officer} className="ses-queue-group">
            <h3 className="ses-queue-officer">
              {g.officer} <span>{g.brothers} brother{g.brothers !== 1 ? "s" : ""}, {g.fines} fine{g.fines !== 1 ? "s" : ""}</span>
            </h3>
            <ul className="ses-queue-list">
              {g.rows.map((r) => <Row key={`${g.officer}:${r.memberId}`} r={r} busy={busy === r.memberId} act={act} />)}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function Row({ r, busy, act }: { r: QueueRow; busy: boolean; act: (a: string, m?: string) => void }) {
  const status = r.ticket?.status ?? null;
  const skipped = status === "skipped";
  return (
    <li className={`ses-queue-row${r.isNow ? " now" : ""}${skipped ? " skipped" : ""}`}>
      <span className="ses-queue-roll">{r.roll != null ? `#${r.roll}` : "–"}</span>
      <span className="ses-queue-who">
        <span className="ses-queue-name">{r.name}</span>
        <span className="ses-queue-meta">
          {r.fines} fine{r.fines !== 1 ? "s" : ""}
          {r.ticket?.no ? `, ticket #${r.ticket.no}` : ""}
          {r.requeued ? ", came back late" : ""}
          {r.ticket?.phoneDisplay ? `, ${r.ticket.phoneDisplay}` : ""}
        </span>
      </span>
      {status && status !== "done" && <span className={`ses-queue-status s-${status}`}>{STATUS_LABEL[status] ?? status}</span>}
      <span className="ses-queue-actions">
        {r.ticket?.phone && (
          <>
            <a className="ses-choice" href={`tel:${r.ticket.phone}`}>Call</a>
            <a className="ses-choice" href={`sms:${r.ticket.phone}?&body=${encodeURIComponent(TEXT_BODY)}`} onClick={() => status === "waiting" && act("call", r.memberId)}>Text</a>
          </>
        )}
        {skipped ? (
          <button type="button" className="ses-choice" disabled={busy} onClick={() => act("here", r.memberId)}>He&rsquo;s here</button>
        ) : (
          <>
            {status !== "here" && <button type="button" className="ses-choice" disabled={busy} onClick={() => act("here", r.memberId)}>Here</button>}
            <button type="button" className="ses-choice" disabled={busy} onClick={() => act("skip", r.memberId)}>Skip</button>
          </>
        )}
      </span>
    </li>
  );
}
