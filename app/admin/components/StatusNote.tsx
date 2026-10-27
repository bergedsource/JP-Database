"use client";

import { useEffect, useState } from "react";

export const STATUS_NOTE_KEY = "jp_status_note";
const PRESETS = ["On a 10 min break", "Running ~15 min behind", "Back on track"];

// One line the chair posts to every brother's ticket ("On a 10 min break").
// Explained waits feel shorter than unexplained ones.
export default function StatusNote() {
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, string>) => { setSaved(d[STATUS_NOTE_KEY] ?? ""); setDraft(d[STATUS_NOTE_KEY] ?? ""); })
      .catch(() => {});
  }, []);

  async function save(value: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: STATUS_NOTE_KEY, value }),
    });
    if (res.ok) { setSaved(value.trim().slice(0, 120)); setDraft(value.trim().slice(0, 120)); }
    else setError("Couldn't post that. Try again.");
    setBusy(false);
  }

  return (
    <div className="ses-status-note">
      <label htmlFor="jp-status-note" className="ses-card-hint">Status for brothers&rsquo; tickets</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          id="jp-status-note"
          type="text"
          className="adm-input"
          style={{ flex: "1 1 200px", minWidth: 0 }}
          maxLength={120}
          placeholder="e.g. On a 10 min break"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(draft); }}
        />
        <button type="button" className="adm-btn" disabled={busy || draft.trim() === saved} onClick={() => save(draft)}>Post</button>
        {saved && <button type="button" className="ses-choice" disabled={busy} onClick={() => save("")}>Clear</button>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button key={p} type="button" className="ses-choice" disabled={busy} onClick={() => save(p)}>{p}</button>
        ))}
      </div>
      {saved ? <p className="ses-card-hint">Showing on tickets: &ldquo;{saved}&rdquo;</p> : null}
      {error && <p className="ses-card-hint" role="alert" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
