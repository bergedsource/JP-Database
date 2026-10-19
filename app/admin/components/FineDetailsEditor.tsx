"use client";

import { useState } from "react";

interface FineDetailsEditorProps {
  fineId: string;
  description: string;
  notes: string | null;
  canEdit: boolean;
  onSaved: (description: string, notes: string | null) => void | Promise<void>;
}

// Description + private notes for a fine, with inline editing for owners.
export default function FineDetailsEditor({ fineId, description, notes, canEdit, onSaved }: FineDetailsEditorProps) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(description);
  const [note, setNote] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function startEdit() {
    setDesc(description);
    setNote(notes ?? "");
    setError("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/fines/${fineId}/details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc, notes: note }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error ?? "Failed to save");
      setSaving(false);
      return;
    }
    await onSaved(d.description, d.notes);
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <>
        <p className="adm-fine-desc">
          {description}
          {canEdit && (
            <button
              type="button"
              onClick={startEdit}
              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 11, padding: "0 4px", marginLeft: 4, fontFamily: "'IBM Plex Mono', monospace" }}
              title="Edit description and notes"
            >✎ {notes ? "edit" : "edit / add note"}</button>
          )}
        </p>
        {notes && <p className="adm-fine-notes">{notes}</p>}
      </>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <label className="adm-label" style={{ marginBottom: 0 }}>Description</label>
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="adm-input" style={{ fontSize: 13, resize: "vertical" }} autoFocus />
      <label className="adm-label" style={{ marginBottom: 0 }}>
        Notes <span style={{ color: "var(--text-dim)", textTransform: "none", letterSpacing: 0 }}>(admin only, never shown publicly)</span>
      </label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="adm-input" style={{ fontSize: 13, resize: "vertical" }} placeholder="Private notes" />
      {error && <p className="adm-error" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="adm-btn" disabled={saving} onClick={save} style={{ padding: "4px 12px", fontSize: 12 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={saving} onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
