"use client";

import { useState } from "react";
import type { Fine, Member } from "@/lib/types";

interface MembersTabProps {
  members: Member[];
  fines: Fine[];
  isPrivileged: boolean;
  refresh: () => Promise<void>;
}

export default function MembersTab({ members, fines, isPrivileged, refresh }: MembersTabProps) {
  const [memberForm, setMemberForm] = useState({
    name: "",
    status: "active" as Member["status"],
    roll: "",
  });
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberError, setMemberError] = useState("");

  async function submitMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberSubmitting(true);
    setMemberError("");

    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: memberForm.name.trim(),
        status: memberForm.status,
        roll: memberForm.roll,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setMemberError(data.error ?? "Failed to add member");
    } else {
      setMemberForm({ name: "", status: "active", roll: "" });
      await refresh();
    }
    setMemberSubmitting(false);
  }

  async function updateMemberStatus(id: string, status: Member["status"]) {
    const res = await fetch(`/api/admin/members/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await refresh();
  }

  async function deleteMember(id: string) {
    if (!confirm("Delete this member and all their fines?")) return;
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
    if (res.ok) await refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {isPrivileged && <div className="adm-card">
        <div className="adm-card-header">
          <span className="adm-card-title">Add Member</span>
        </div>
        <div className="adm-card-body">
          <form onSubmit={submitMember} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="adm-label">Full Name</label>
              <input
                type="text"
                value={memberForm.name}
                onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                required
                placeholder="First Last"
                className="adm-input"
              />
            </div>
            <div>
              <label className="adm-label">Roll #</label>
              <input
                type="number"
                value={memberForm.roll}
                onChange={(e) => setMemberForm({ ...memberForm, roll: e.target.value })}
                placeholder="e.g. 1391"
                className="adm-input"
                style={{ width: 120 }}
              />
            </div>
            <div>
              <label className="adm-label">Status</label>
              <select
                value={memberForm.status}
                onChange={(e) => setMemberForm({ ...memberForm, status: e.target.value as Member["status"] })}
                className="adm-input"
                style={{ width: "auto" }}
              >
                <option value="active">Active</option>
                <option value="pledge">Pledge</option>
                <option value="alumni">Alumni</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {memberError && <p className="adm-error">{memberError}</p>}
            {isPrivileged && (
              <button type="submit" disabled={memberSubmitting} className="adm-btn">
                {memberSubmitting ? "Adding…" : "Add Member"}
              </button>
            )}
          </form>
        </div>
      </div>}

      <div className="adm-card">
        {members.length === 0 ? (
          <p className="adm-empty">No members yet.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roll #</th>
                <th>Status</th>
                <th>Fines</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const memberFines = fines.filter((f) => f.member_id === m.id);
                const open = memberFines.filter((f) => ["pending", "upheld"].includes(f.status)).length;
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.name}</td>
                    <td style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: m.roll ? "var(--gold)" : "var(--text-dim)" }}>
                      {m.roll ?? "—"}
                    </td>
                    <td>
                      {isPrivileged ? (
                        <select
                          value={m.status}
                          onChange={(e) => updateMemberStatus(m.id, e.target.value as Member["status"])}
                          className="adm-status-select"
                        >
                          <option value="active">Active</option>
                          <option value="pledge">Pledge</option>
                          <option value="alumni">Alumni</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      ) : (
                        <span className="adm-status-badge" style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace" }}>{m.status}</span>
                      )}
                    </td>
                    <td>
                      {open > 0 ? (
                        <span style={{ color: "var(--red)", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                          {open} open
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>
                      )}
                      {memberFines.length > 0 && (
                        <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 6 }}>
                          ({memberFines.length} total)
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isPrivileged && (
                        <button onClick={() => deleteMember(m.id)} className="adm-delete-btn">Delete</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
