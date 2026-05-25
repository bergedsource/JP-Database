"use client";

import { useEffect, useState } from "react";
import type { Member, Unbecoming, UnbecomingAttachment, UnbecomingStatus } from "@/lib/types";

interface UnbecomingsTabProps {
  members: Member[];
}

export default function UnbecomingsTab({ members }: UnbecomingsTabProps) {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) return <UnbecomingsLock onUnlock={() => setUnlocked(true)} />;
  return <UnbecomingsContent members={members} />;
}

function UnbecomingsLock({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr("");
    const res = await fetch("/api/admin/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Failed to unlock");
      setSubmitting(false);
      return;
    }
    onUnlock();
  }

  return (
    <div className="adm-card" style={{ maxWidth: 460, margin: "32px auto" }}>
      <div className="adm-card-header">
        <span className="adm-card-title">Restricted Area</span>
      </div>
      <div className="adm-card-body">
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Re-enter your password to access Unbecomings.
        </p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="adm-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="adm-input"
              autoFocus
              autoComplete="current-password"
              required
              style={{ width: "100%" }}
            />
          </div>
          {err && <p className="adm-error">{err}</p>}
          <button type="submit" disabled={submitting} className="adm-btn">
            {submitting ? "Verifying…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}

function UnbecomingsContent({ members }: { members: Member[] }) {
  const [list, setList] = useState<Unbecoming[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | UnbecomingStatus>("all");
  const [search, setSearch] = useState("");

  async function loadList() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/unbecomings");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setList(data.unbecomings ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadList();
  }, []);

  const filtered = list.filter((u) => {
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !u.title.toLowerCase().includes(q) &&
        !(u.member_name ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="adm-filters" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search title or member…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="adm-input"
            style={{ minWidth: 220 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="adm-input"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="upheld">Upheld</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <button onClick={() => setAdding(true)} className="adm-btn">+ Add Unbecoming</button>
      </div>

      {adding && (
        <AddUnbecomingCard
          members={members}
          onCancel={() => setAdding(false)}
          onCreated={async (newId) => {
            setAdding(false);
            await loadList();
            setExpandedId(newId);
          }}
        />
      )}

      <div className="adm-card">
        {loading ? (
          <p className="adm-loading">Loading Unbecomings…</p>
        ) : error ? (
          <p className="adm-error" style={{ padding: 16 }}>{error}</p>
        ) : filtered.length === 0 ? (
          <p className="adm-empty">No Unbecomings recorded{statusFilter !== "all" || search ? " matching the current filter" : ""}.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Incident Date</th>
                <th>Title</th>
                <th>Status</th>
                <th>Files</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <UnbecomingRow
                  key={u.id}
                  unbecoming={u}
                  expanded={expandedId === u.id}
                  members={members}
                  onToggle={() => setExpandedId(expandedId === u.id ? null : u.id)}
                  onChange={loadList}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UnbecomingRow({
  unbecoming,
  expanded,
  members,
  onToggle,
  onChange,
}: {
  unbecoming: Unbecoming;
  expanded: boolean;
  members: Member[];
  onToggle: () => void;
  onChange: () => Promise<void> | void;
}) {
  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={onToggle}>
        <td style={{ fontWeight: 500 }}>{unbecoming.member_name ?? "—"}</td>
        <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{unbecoming.incident_date}</td>
        <td>{unbecoming.title}</td>
        <td>
          <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: statusColor(unbecoming.status) }}>
            {unbecoming.status}
          </span>
        </td>
        <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "var(--text-dim)" }}>
          {unbecoming.attachment_count ?? 0}
        </td>
        <td style={{ textAlign: "right", color: "var(--text-dim)", fontSize: 12 }}>
          {expanded ? "▾" : "▸"}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: "rgba(255,255,255,0.02)" }}>
            <UnbecomingDetail id={unbecoming.id} members={members} onChange={onChange} onClose={onToggle} />
          </td>
        </tr>
      )}
    </>
  );
}

function statusColor(s: UnbecomingStatus): string {
  if (s === "upheld") return "var(--red)";
  if (s === "dismissed") return "var(--text-dim)";
  return "var(--gold)";
}

function UnbecomingDetail({
  id,
  members,
  onChange,
  onClose,
}: {
  id: string;
  members: Member[];
  onChange: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Unbecoming | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/admin/unbecomings/${id}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setDetail(data.unbecoming);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <p className="adm-loading">Loading…</p>;
  if (error) return <p className="adm-error" style={{ padding: 16 }}>{error}</p>;
  if (!detail) return null;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {editMode ? (
        <UnbecomingForm
          members={members}
          initial={detail}
          onCancel={() => setEditMode(false)}
          onSaved={async () => {
            setEditMode(false);
            await load();
            await onChange();
          }}
          onDeleted={async () => {
            await onChange();
            onClose();
          }}
        />
      ) : (
        <UnbecomingReadView detail={detail} onEdit={() => setEditMode(true)} />
      )}

      <AttachmentsSection
        unbecomingId={id}
        attachments={detail.attachments ?? []}
        onChange={async () => {
          await load();
          await onChange();
        }}
      />
    </div>
  );
}

function UnbecomingReadView({ detail, onEdit }: { detail: Unbecoming; onEdit: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{detail.title}</h3>
        <button onClick={onEdit} className="adm-btn">Edit</button>
      </div>
      <FieldRow label="Status" value={detail.status} mono />
      <FieldRow label="Member" value={detail.member_name ?? "—"} />
      <FieldRow label="Incident Date" value={detail.incident_date} mono />
      {detail.body && (
        <div>
          <div className="adm-label">Write-up</div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: 0, color: "var(--text-base, #e9e3d6)" }}>
            {detail.body}
          </pre>
        </div>
      )}
      {detail.decision && (
        <div>
          <div className="adm-label">Decision</div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: 0, color: "var(--text-base, #e9e3d6)" }}>
            {detail.decision}
          </pre>
        </div>
      )}
      {detail.decision_date && <FieldRow label="Decision Date" value={detail.decision_date} mono />}
      {detail.sanction && (
        <div>
          <div className="adm-label">Sanction</div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, margin: 0, color: "var(--text-base, #e9e3d6)" }}>
            {detail.sanction}
          </pre>
        </div>
      )}
      <FieldRow label="Created by" value={`${detail.created_by} · ${shortTime(detail.created_at)}`} dim />
      <FieldRow label="Updated by" value={`${detail.updated_by} · ${shortTime(detail.updated_at)}`} dim />
    </div>
  );
}

function FieldRow({ label, value, mono, dim }: { label: string; value: string; mono?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--text-muted)", minWidth: 110 }}>{label}:</span>
      <span style={{
        fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit",
        fontSize: mono ? 12 : 13,
        color: dim ? "var(--text-dim)" : "inherit",
      }}>{value}</span>
    </div>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function UnbecomingForm({
  members,
  initial,
  onCancel,
  onSaved,
  onDeleted,
}: {
  members: Member[];
  initial: Unbecoming;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
  onDeleted?: () => Promise<void> | void;
}) {
  const [memberId, setMemberId] = useState(initial.member_id);
  const [memberSearch, setMemberSearch] = useState(initial.member_name ?? "");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [incidentDate, setIncidentDate] = useState(initial.incident_date);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<UnbecomingStatus>(initial.status);
  const [decision, setDecision] = useState(initial.decision ?? "");
  const [decisionDate, setDecisionDate] = useState(initial.decision_date ?? "");
  const [sanction, setSanction] = useState(initial.sanction ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const memberMatches = memberSearch.trim()
    ? members
        .filter((m) => m.name.toLowerCase().includes(memberSearch.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const body_ = {
      member_id: memberId,
      incident_date: incidentDate,
      title,
      body,
      status,
      decision: decision.trim() ? decision : null,
      decision_date: decisionDate || null,
      sanction: sanction.trim() ? sanction : null,
    };
    const res = await fetch(`/api/admin/unbecomings/${initial.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body_),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Failed to save");
      setSaving(false);
      return;
    }
    await onSaved();
    setSaving(false);
  }

  async function del() {
    if (!confirm("Delete this Unbecoming and all its attachments? This cannot be undone.")) return;
    setSaving(true);
    const res = await fetch(`/api/admin/unbecomings/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Failed to delete");
      setSaving(false);
      return;
    }
    if (onDeleted) await onDeleted();
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <label className="adm-label">Member</label>
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => {
              setMemberSearch(e.target.value);
              setShowMemberDropdown(true);
              setMemberId("");
            }}
            onFocus={() => setShowMemberDropdown(true)}
            onBlur={() => setTimeout(() => setShowMemberDropdown(false), 150)}
            className="adm-input"
            autoComplete="off"
            required
          />
          {showMemberDropdown && memberMatches.length > 0 && (
            <ul className="adm-suggestions">
              {memberMatches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMemberId(m.id);
                      setMemberSearch(m.name);
                      setShowMemberDropdown(false);
                    }}
                    className="adm-suggestion-btn"
                  >
                    <span className="adm-suggestion-name">{m.name}</span>
                    <span className="adm-suggestion-status">{m.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="adm-label">Incident Date</label>
          <input
            type="date"
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
            className="adm-input"
            required
          />
        </div>
      </div>

      <div>
        <label className="adm-label">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="adm-input"
          maxLength={200}
          required
        />
      </div>

      <div>
        <label className="adm-label">Write-up</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="adm-input"
          rows={8}
          maxLength={50000}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="adm-label">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as UnbecomingStatus)}
            className="adm-input"
          >
            <option value="pending">Pending</option>
            <option value="upheld">Upheld</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <div>
          <label className="adm-label">Decision Date (optional)</label>
          <input
            type="date"
            value={decisionDate}
            onChange={(e) => setDecisionDate(e.target.value)}
            className="adm-input"
          />
        </div>
      </div>

      <div>
        <label className="adm-label">Decision (optional)</label>
        <textarea
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          className="adm-input"
          rows={3}
          maxLength={5000}
        />
      </div>

      <div>
        <label className="adm-label">Sanction (optional)</label>
        <textarea
          value={sanction}
          onChange={(e) => setSanction(e.target.value)}
          className="adm-input"
          rows={3}
          maxLength={5000}
        />
      </div>

      {err && <p className="adm-error">{err}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving || !memberId} className="adm-btn">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onCancel} className="adm-btn-ghost">Cancel</button>
        </div>
        {onDeleted && (
          <button type="button" onClick={del} disabled={saving} className="adm-delete-btn">
            Delete Record
          </button>
        )}
      </div>
    </form>
  );
}

function AddUnbecomingCard({
  members,
  onCancel,
  onCreated,
}: {
  members: Member[];
  onCancel: () => void;
  onCreated: (id: string) => Promise<void> | void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const blank: Unbecoming = {
    id: "",
    member_id: "",
    incident_date: today,
    title: "",
    body: "",
    status: "pending",
    decision: null,
    decision_date: null,
    sanction: null,
    created_at: "",
    created_by: "",
    updated_at: "",
    updated_by: "",
  };
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(form: typeof blank): Promise<{ id: string } | null> {
    setSaving(true);
    setErr("");
    const res = await fetch("/api/admin/unbecomings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        member_id: form.member_id,
        incident_date: form.incident_date,
        title: form.title,
        body: form.body,
        status: form.status,
        decision: form.decision,
        decision_date: form.decision_date,
        sanction: form.sanction,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Failed to create");
      return null;
    }
    return res.json();
  }

  return (
    <div className="adm-card">
      <div className="adm-card-header">
        <span className="adm-card-title">New Unbecoming</span>
      </div>
      <div className="adm-card-body">
        <AddUnbecomingForm
          members={members}
          initial={blank}
          saving={saving}
          err={err}
          onCancel={onCancel}
          onSubmit={async (form) => {
            const result = await submit(form);
            if (result?.id) await onCreated(result.id);
          }}
        />
      </div>
    </div>
  );
}

function AddUnbecomingForm({
  members,
  initial,
  saving,
  err,
  onCancel,
  onSubmit,
}: {
  members: Member[];
  initial: Unbecoming;
  saving: boolean;
  err: string;
  onCancel: () => void;
  onSubmit: (form: Unbecoming) => Promise<void> | void;
}) {
  const [memberId, setMemberId] = useState(initial.member_id);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [incidentDate, setIncidentDate] = useState(initial.incident_date);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<UnbecomingStatus>(initial.status);
  const [decision, setDecision] = useState("");
  const [decisionDate, setDecisionDate] = useState("");
  const [sanction, setSanction] = useState("");

  const memberMatches = memberSearch.trim()
    ? members
        .filter((m) => m.name.toLowerCase().includes(memberSearch.trim().toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...initial,
          member_id: memberId,
          incident_date: incidentDate,
          title,
          body,
          status,
          decision: decision.trim() ? decision : null,
          decision_date: decisionDate || null,
          sanction: sanction.trim() ? sanction : null,
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <label className="adm-label">Member</label>
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => {
              setMemberSearch(e.target.value);
              setShowMemberDropdown(true);
              setMemberId("");
            }}
            onFocus={() => setShowMemberDropdown(true)}
            onBlur={() => setTimeout(() => setShowMemberDropdown(false), 150)}
            className="adm-input"
            autoComplete="off"
            placeholder="Search member…"
            required
          />
          {showMemberDropdown && memberMatches.length > 0 && (
            <ul className="adm-suggestions">
              {memberMatches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMemberId(m.id);
                      setMemberSearch(m.name);
                      setShowMemberDropdown(false);
                    }}
                    className="adm-suggestion-btn"
                  >
                    <span className="adm-suggestion-name">{m.name}</span>
                    <span className="adm-suggestion-status">{m.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className="adm-label">Incident Date</label>
          <input
            type="date"
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
            className="adm-input"
            required
          />
        </div>
      </div>

      <div>
        <label className="adm-label">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="adm-input"
          maxLength={200}
          placeholder="e.g. Conduct at chapter event 2026-05-10"
          required
        />
      </div>

      <div>
        <label className="adm-label">Write-up</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="adm-input"
          rows={8}
          maxLength={50000}
          placeholder="Full incident report, witness statements, etc."
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="adm-label">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as UnbecomingStatus)}
            className="adm-input"
          >
            <option value="pending">Pending</option>
            <option value="upheld">Upheld</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <div>
          <label className="adm-label">Decision Date (optional)</label>
          <input
            type="date"
            value={decisionDate}
            onChange={(e) => setDecisionDate(e.target.value)}
            className="adm-input"
          />
        </div>
      </div>

      <div>
        <label className="adm-label">Decision (optional)</label>
        <textarea
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          className="adm-input"
          rows={3}
          maxLength={5000}
        />
      </div>

      <div>
        <label className="adm-label">Sanction (optional)</label>
        <textarea
          value={sanction}
          onChange={(e) => setSanction(e.target.value)}
          className="adm-input"
          rows={3}
          maxLength={5000}
        />
      </div>

      {err && <p className="adm-error">{err}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={saving || !memberId} className="adm-btn">
          {saving ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="adm-btn-ghost">Cancel</button>
      </div>
    </form>
  );
}

function AttachmentsSection({
  unbecomingId,
  attachments,
  onChange,
}: {
  unbecomingId: string;
  attachments: UnbecomingAttachment[];
  onChange: () => Promise<void> | void;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/admin/unbecomings/${unbecomingId}/attachments`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    e.target.value = "";
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Upload failed");
      return;
    }
    await onChange();
  }

  async function download(aid: string) {
    const res = await fetch(`/api/admin/unbecomings/${unbecomingId}/attachments/${aid}/download`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Failed to get download link");
      return;
    }
    const data = await res.json();
    window.open(data.url, "_blank");
  }

  async function del(aid: string) {
    if (!confirm("Delete this attachment?")) return;
    const res = await fetch(`/api/admin/unbecomings/${unbecomingId}/attachments/${aid}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? "Delete failed");
      return;
    }
    await onChange();
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="adm-label" style={{ margin: 0 }}>Files</div>
        <label className="adm-btn" style={{ cursor: uploading ? "wait" : "pointer", display: "inline-block" }}>
          {uploading ? "Uploading…" : "+ Upload file"}
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {err && <p className="adm-error" style={{ marginTop: 8 }}>{err}</p>}
      {attachments.length === 0 ? (
        <p style={{ color: "var(--text-dim)", fontSize: 12, fontStyle: "italic", marginTop: 8 }}>No files attached.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map((a) => (
            <li key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4 }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.file_name}</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {fmtSize(a.file_size_bytes)} · {a.uploaded_by} · {shortTime(a.uploaded_at)}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => download(a.id)} className="adm-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }}>Download</button>
                <button onClick={() => del(a.id)} className="adm-delete-btn" style={{ fontSize: 11 }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
