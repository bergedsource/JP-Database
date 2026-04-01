"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { AuditLog, Fine, FineStatus, FineType, Member } from "@/lib/types";

const FINE_TYPES: FineType[] = [
  "Conduct Unbecoming (§11-010)",
  "General Misconduct (§11-020)",
  "Misconduct Under Influence (§11-030)",
  "Missing Security at Function (§11-050)",
  "Missing Required Event (§11-060)",
  "Missing Recruitment/Work Week (§11-070)",
  "Removal/Damage to House Property (§11-080)",
  "Removal/Damage to Personal Property (§11-090)",
  "Missing Chapter Meeting (§11-100)",
  "Missing Exec Meeting (§11-110)",
  "Missing Yearbook/Composite (§11-120)",
  "Kitchen Duties (§11-130)",
  "House Clean (§11-140)",
  "Event House Clean (§11-150)",
  "Chores (§11-160)",
  "Missing Philanthropy Event (§11-170)",
  "Smoking (§11-190)",
  "Fire Alarm (§11-200)",
  "Drop Testing Cleanup (§11-210)",
  "Unauthorized Weapon Use (§11-220)",
  "Sexual Relations on Sleeping Porch (§11-230)",
  "Formal Dinner Attire (§11-240)",
  "Grazers (§11-250)",
  "Social Probation Violation (§11-260)",
  "Missing House Philanthropy Event (§11-270)",
  "Missing Signed-Up Philanthropy Event (§11-280)",
  "Bathroom Trash Violation (§11-290)",
  "Physical Violence (§11-300)",
  "Committee Meeting Absence (§7-005)",
  "Missing JP Meeting (§10-220)",
  "Cell Phone in Exec Meeting (§8-060)",
  "Grievance Committee No-Show (§7-030)",
  "Guest Misconduct (§12-030)",
  "Breathalyzer Misuse (§12-080)",
  "Silent Sleeping Porch Violation (§18-350)",
  "Missing Blood Drive (§16-010)",
  "Missing Philanthropy Hours (§16-010)",
  "Vacant Room (§17-020)",
  "Room Improvement Removal (§17-240)",
  "Inadequate Room Space (§17-360)",
  "Failure to Vacate Room (§17-370)",
  "Other",
];

const STATUS_COLORS: Record<FineStatus, { bg: string; color: string; border: string }> = {
  pending:   { bg: "rgba(251,191,36,0.1)",   color: "#FCD34D", border: "rgba(251,191,36,0.3)" },
  upheld:    { bg: "rgba(239,68,68,0.1)",    color: "#F87171", border: "rgba(239,68,68,0.3)" },
  dismissed: { bg: "rgba(52,211,153,0.1)",   color: "#34D399", border: "rgba(52,211,153,0.3)" },
  paid:      { bg: "rgba(96,165,250,0.1)",   color: "#60A5FA", border: "rgba(96,165,250,0.3)" },
  labor:     { bg: "rgba(167,139,250,0.1)",  color: "#A78BFA", border: "rgba(167,139,250,0.3)" },
};

type Tab = "fines" | "outstanding" | "members" | "audit";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fines");
  const [members, setMembers] = useState<Member[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [filterStatus, setFilterStatus] = useState<FineStatus | "all">("all");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminEmail, setAdminEmail] = useState("");

  // Fine form state
  const [fineForm, setFineForm] = useState({
    fine_type: "General Misconduct" as FineType,
    description: "",
    amount: "",
    term: "",
    date_issued: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(false);
  const [fineSubmitting, setFineSubmitting] = useState(false);
  const [fineError, setFineError] = useState("");

  // Member form state
  const [memberForm, setMemberForm] = useState({
    name: "",
    status: "active" as Member["status"],
  });
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberError, setMemberError] = useState("");

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadData();
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email ?? "unknown");
    });
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: m }, { data: f }, { data: a }] = await Promise.all([
      supabase.from("members").select("*").order("name"),
      supabase.from("fines").select("*, members(name)").order("date_issued", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setMembers(m ?? []);
    setFines(
      (f ?? []).map((fine: Fine & { members?: { name: string } }) => ({
        ...fine,
        member_name: fine.members?.name,
      }))
    );
    setAuditLogs(a ?? []);
    setLoading(false);
  }

  async function log(action: string, details: string) {
    await supabase.from("audit_logs").insert({ admin_email: adminEmail, action, details });
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  async function submitFine(e: React.FormEvent) {
    e.preventDefault();
    if (selectedMembers.length === 0) { setFineError("Select at least one member."); return; }
    setFineSubmitting(true);
    setFineError("");

    const rows = selectedMembers.map((m) => ({
      member_id: m.id,
      fine_type: fineForm.fine_type,
      description: fineForm.description,
      amount: fineForm.amount ? parseFloat(fineForm.amount) : null,
      status: "pending",
      term: fineForm.term,
      date_issued: fineForm.date_issued,
      notes: fineForm.notes || null,
    }));

    const { error } = await supabase.from("fines").insert(rows);

    if (error) {
      setFineError(error.message);
    } else {
      const names = selectedMembers.map((m) => m.name).join(", ");
      await log("Issued Fine", `${fineForm.fine_type} against ${names} — "${fineForm.description}" (${fineForm.term}${fineForm.amount ? `, $${fineForm.amount}` : ""})`);
      setFineForm({
        fine_type: "General Misconduct (§11-020)",
        description: "",
        amount: "",
        term: "",
        date_issued: new Date().toISOString().split("T")[0],
        notes: "",
      });
      setSelectedMembers([]);
      setMemberSearch("");
      await loadData();
    }
    setFineSubmitting(false);
  }

  async function updateFineStatus(id: string, status: FineStatus) {
    const fine = fines.find((f) => f.id === id);
    const dateResolved = ["paid", "dismissed", "labor"].includes(status)
      ? new Date().toISOString().split("T")[0]
      : null;

    await supabase
      .from("fines")
      .update({ status, date_resolved: dateResolved })
      .eq("id", id);

    if (fine) {
      await log("Updated Fine Status", `${fine.member_name ?? "Unknown"} — ${fine.fine_type} changed to "${status}"`);

      if (status === "paid") {
        await fetch("/api/export-fine", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            member_name: fine.member_name,
            fine_type: fine.fine_type,
            description: fine.description,
            amount: fine.amount,
            term: fine.term,
            date_issued: fine.date_issued,
            date_resolved: dateResolved,
            notes: fine.notes,
          }),
        });
      }
    }
    await loadData();
  }

  async function deleteFine(id: string) {
    if (!confirm("Delete this fine?")) return;
    const fine = fines.find((f) => f.id === id);
    await supabase.from("fines").delete().eq("id", id);
    if (fine) {
      await log("Deleted Fine", `${fine.member_name ?? "Unknown"} — ${fine.fine_type} (${fine.term})`);
    }
    await loadData();
  }

  async function submitMember(e: React.FormEvent) {
    e.preventDefault();
    setMemberSubmitting(true);
    setMemberError("");

    const { error } = await supabase.from("members").insert({
      name: memberForm.name.trim(),
      status: memberForm.status,
    });

    if (error) {
      setMemberError(error.message);
    } else {
      await log("Added Member", `${memberForm.name.trim()} (${memberForm.status})`);
      setMemberForm({ name: "", status: "active" });
      await loadData();
    }
    setMemberSubmitting(false);
  }

  async function updateMemberStatus(id: string, status: Member["status"]) {
    const member = members.find((m) => m.id === id);
    await supabase.from("members").update({ status }).eq("id", id);
    if (member) {
      await log("Updated Member Status", `${member.name} changed from "${member.status}" to "${status}"`);
    }
    await loadData();
  }

  async function deleteMember(id: string) {
    if (!confirm("Delete this member and all their fines?")) return;
    const member = members.find((m) => m.id === id);
    await supabase.from("fines").delete().eq("member_id", id);
    await supabase.from("members").delete().eq("id", id);
    if (member) {
      await log("Deleted Member", `${member.name} (${member.status})`);
    }
    await loadData();
  }

  const filteredFines = fines.filter((f) => {
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (filterMember !== "all" && f.member_id !== filterMember) return false;
    return true;
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');

        :root {
          --bg: #0D1117;
          --surface: #161B22;
          --surface-2: #1C2128;
          --border: #30363D;
          --border-light: #21262D;
          --gold: #CFB53B;
          --gold-dim: #8A7520;
          --text: #E6EDF3;
          --text-muted: #8B949E;
          --text-dim: #484F58;
          --red: #F87171;
        }

        .adm-page {
          min-height: 100vh;
          background: var(--bg);
          font-family: 'IBM Plex Sans', sans-serif;
          color: var(--text);
        }

        .adm-header {
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 60px;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .adm-header-left { display: flex; align-items: center; gap: 14px; }

        .adm-gold-bar {
          width: 3px;
          height: 30px;
          background: var(--gold);
          border-radius: 2px;
          flex-shrink: 0;
        }

        .adm-title {
          font-family: 'Playfair Display', serif;
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
          line-height: 1.1;
        }

        .adm-subtitle {
          font-size: 10px;
          color: var(--text-dim);
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-family: 'IBM Plex Mono', monospace;
          margin-top: 1px;
        }

        .adm-signout {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-family: 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .adm-signout:hover { border-color: var(--gold); color: var(--gold); }

        .adm-body {
          max-width: 1000px;
          margin: 0 auto;
          padding: 32px 24px 64px;
        }

        .adm-tabs {
          display: flex;
          border-bottom: 1px solid var(--border);
          margin-bottom: 28px;
        }

        .adm-tab {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          padding: 10px 20px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          font-family: 'IBM Plex Mono', monospace;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .adm-tab:hover { color: var(--text); }
        .adm-tab.active { color: var(--gold); border-bottom-color: var(--gold); }

        .adm-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }

        .adm-card-header {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }

        .adm-card-title {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-muted);
          font-family: 'IBM Plex Mono', monospace;
        }

        .adm-card-body { padding: 20px; }

        .adm-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 6px;
          font-family: 'IBM Plex Mono', monospace;
        }
        .adm-req { color: var(--gold); }
        .adm-opt { color: var(--text-dim); font-weight: 400; }

        .adm-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 9px 12px;
          font-size: 13px;
          font-family: 'IBM Plex Sans', sans-serif;
          color: var(--text);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          -webkit-appearance: none;
        }
        .adm-input::placeholder { color: var(--text-dim); }
        .adm-input:focus {
          border-color: var(--gold-dim);
          box-shadow: 0 0 0 3px rgba(207,181,59,0.08);
        }
        .adm-input option { background: #1C2128; }

        .adm-member-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .adm-member-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(207,181,59,0.12);
          border: 1px solid rgba(207,181,59,0.3);
          border-radius: 5px;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 500;
          color: var(--gold);
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .adm-member-tag-remove {
          background: transparent;
          border: none;
          color: var(--gold-dim);
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          padding: 0;
          display: flex;
          align-items: center;
          transition: color 0.1s;
        }
        .adm-member-tag-remove:hover { color: var(--red); }

        .adm-suggestions {
          position: absolute;
          top: calc(100% + 4px);
          left: 0; right: 0;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          z-index: 60;
          list-style: none;
          margin: 0;
          padding: 0;
          max-height: 200px;
          overflow-y: auto;
        }

        .adm-suggestion-btn {
          width: 100%;
          text-align: left;
          padding: 9px 14px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-light);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: var(--text);
          font-size: 13px;
          font-family: 'IBM Plex Sans', sans-serif;
          transition: background 0.1s;
        }
        .adm-suggestion-btn:last-child { border-bottom: none; }
        .adm-suggestion-btn:hover { background: rgba(207,181,59,0.06); }
        .adm-suggestion-name { font-weight: 500; }
        .adm-suggestion-status {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: capitalize;
          font-family: 'IBM Plex Mono', monospace;
        }

        .adm-btn {
          background: var(--gold);
          color: #0D1117;
          border: none;
          padding: 9px 20px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.3px;
          font-family: 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .adm-btn:hover { opacity: 0.85; }
        .adm-btn:disabled { opacity: 0.35; cursor: not-allowed; }

        .adm-fine-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-light);
          border-left: 3px solid transparent;
          transition: background 0.1s;
        }
        .adm-fine-row:last-child { border-bottom: none; }
        .adm-fine-row:hover { background: rgba(255,255,255,0.015); }

        .adm-fine-member { font-weight: 600; font-size: 14px; color: var(--text); }
        .adm-fine-type { font-size: 12px; color: var(--text-muted); font-family: 'IBM Plex Mono', monospace; }
        .adm-fine-desc { font-size: 13px; color: var(--text); margin-top: 3px; }
        .adm-fine-notes { font-size: 11px; color: var(--gold-dim); font-style: italic; margin-top: 3px; }
        .adm-fine-meta { font-size: 11px; color: var(--text-dim); margin-top: 5px; font-family: 'IBM Plex Mono', monospace; }

        .adm-status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          font-family: 'IBM Plex Mono', monospace;
          border-width: 1px;
          border-style: solid;
          white-space: nowrap;
        }

        .adm-status-select {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 11px;
          color: var(--text-muted);
          font-family: 'IBM Plex Sans', sans-serif;
          cursor: pointer;
          outline: none;
          transition: border-color 0.15s;
        }
        .adm-status-select:focus { border-color: var(--gold-dim); }
        .adm-status-select option { background: #1C2128; }

        .adm-delete-btn {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 11px;
          cursor: pointer;
          font-family: 'IBM Plex Sans', sans-serif;
          transition: color 0.15s;
          padding: 0;
        }
        .adm-delete-btn:hover { color: var(--red); }

        .adm-filters { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }

        .adm-table { width: 100%; border-collapse: collapse; }
        .adm-table thead tr { border-bottom: 1px solid var(--border); }
        .adm-table th {
          text-align: left;
          padding: 11px 20px;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          background: var(--surface-2);
        }
        .adm-table td {
          padding: 12px 20px;
          border-bottom: 1px solid var(--border-light);
          font-size: 13px;
          color: var(--text);
        }
        .adm-table tbody tr:last-child td { border-bottom: none; }
        .adm-table tbody tr:hover td { background: rgba(255,255,255,0.012); }

        .adm-member-block {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 14px;
        }
        .adm-member-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
        }
        .adm-member-block-name { font-weight: 600; font-size: 14px; color: var(--text); }

        .adm-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-bottom: 20px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
        }

        .adm-error { font-size: 12px; color: var(--red); margin-top: 4px; }
        .adm-loading { color: var(--text-muted); font-size: 13px; padding: 64px 0; text-align: center; font-style: italic; }
        .adm-empty { color: var(--text-dim); font-size: 13px; text-align: center; padding: 40px 0; }
      `}</style>

      <div className="adm-page">
        {/* Header */}
        <header className="adm-header">
          <div className="adm-header-left">
            <div className="adm-gold-bar" />
            <div>
              <div className="adm-title">JP Admin</div>
              <div className="adm-subtitle">Acacia · Oregon State</div>
            </div>
          </div>
          <button onClick={signOut} className="adm-signout">Sign out</button>
        </header>

        <div className="adm-body">
          {/* Tabs */}
          <div className="adm-tabs">
            {(["fines", "outstanding", "members", "audit"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`adm-tab${tab === t ? " active" : ""}`}
              >
                {t}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="adm-loading">Loading records…</p>
          ) : (
            <>
              {/* FINES TAB */}
              {tab === "fines" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  {/* Issue Fine Form */}
                  <div className="adm-card">
                    <div className="adm-card-header">
                      <span className="adm-card-title">Issue Fine</span>
                    </div>
                    <div className="adm-card-body">
                      <form onSubmit={submitFine} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                        <div style={{ position: "relative", gridColumn: "span 2" }}>
                          <label className="adm-label">
                            Members <span className="adm-req">*</span>
                            {selectedMembers.length > 0 && (
                              <span style={{ color: "var(--gold)", marginLeft: 6, fontWeight: 600 }}>
                                {selectedMembers.length} selected
                              </span>
                            )}
                          </label>
                          <input
                            type="text"
                            value={memberSearch}
                            onChange={(e) => {
                              setMemberSearch(e.target.value);
                              setShowMemberSuggestions(true);
                            }}
                            onFocus={() => setShowMemberSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowMemberSuggestions(false), 150)}
                            placeholder="Search and add members…"
                            autoComplete="off"
                            className="adm-input"
                          />
                          {showMemberSuggestions && memberSearch.trim() && (
                            <ul className="adm-suggestions">
                              {members
                                .filter((m) =>
                                  (m.status === "active" || m.status === "pledge") &&
                                  m.name.toLowerCase().includes(memberSearch.toLowerCase()) &&
                                  !selectedMembers.find((s) => s.id === m.id)
                                )
                                .map((m) => (
                                  <li key={m.id}>
                                    <button
                                      type="button"
                                      onMouseDown={() => {
                                        setSelectedMembers((prev) => [...prev, m]);
                                        setMemberSearch("");
                                        setShowMemberSuggestions(false);
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
                          {selectedMembers.length > 0 && (
                            <div className="adm-member-tags">
                              {selectedMembers.map((m) => (
                                <span key={m.id} className="adm-member-tag">
                                  {m.name}
                                  <button
                                    type="button"
                                    className="adm-member-tag-remove"
                                    onClick={() => setSelectedMembers((prev) => prev.filter((s) => s.id !== m.id))}
                                  >×</button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="adm-label">Fine Type <span className="adm-req">*</span></label>
                          <select
                            value={fineForm.fine_type}
                            onChange={(e) => setFineForm({ ...fineForm, fine_type: e.target.value as FineType })}
                            className="adm-input"
                          >
                            {FINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        <div style={{ gridColumn: "span 2" }}>
                          <label className="adm-label">Description <span className="adm-req">*</span></label>
                          <input
                            type="text"
                            value={fineForm.description}
                            onChange={(e) => setFineForm({ ...fineForm, description: e.target.value })}
                            required
                            placeholder="Brief description of the offense"
                            className="adm-input"
                          />
                        </div>

                        <div>
                          <label className="adm-label">Amount ($) <span className="adm-opt">optional</span></label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={fineForm.amount}
                            onChange={(e) => setFineForm({ ...fineForm, amount: e.target.value })}
                            placeholder="0.00"
                            className="adm-input"
                          />
                        </div>

                        <div>
                          <label className="adm-label">Term <span className="adm-req">*</span></label>
                          <input
                            type="text"
                            value={fineForm.term}
                            onChange={(e) => setFineForm({ ...fineForm, term: e.target.value })}
                            required
                            placeholder="e.g. Spring 2026"
                            className="adm-input"
                          />
                        </div>

                        <div>
                          <label className="adm-label">Date Issued <span className="adm-req">*</span></label>
                          <input
                            type="date"
                            value={fineForm.date_issued}
                            onChange={(e) => setFineForm({ ...fineForm, date_issued: e.target.value })}
                            required
                            className="adm-input"
                          />
                        </div>

                        <div>
                          <label className="adm-label">Notes <span className="adm-opt">optional</span></label>
                          <input
                            type="text"
                            value={fineForm.notes}
                            onChange={(e) => setFineForm({ ...fineForm, notes: e.target.value })}
                            placeholder="Any additional context"
                            className="adm-input"
                          />
                        </div>

                        {fineError && (
                          <p className="adm-error" style={{ gridColumn: "span 2" }}>{fineError}</p>
                        )}

                        <div style={{ gridColumn: "span 2" }}>
                          <button type="submit" disabled={fineSubmitting} className="adm-btn">
                            {fineSubmitting ? "Issuing…" : "Issue Fine"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="adm-filters">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as FineStatus | "all")}
                      className="adm-input"
                      style={{ width: "auto" }}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="upheld">Upheld</option>
                      <option value="dismissed">Dismissed</option>
                      <option value="paid">Paid</option>
                      <option value="labor">Labor</option>
                    </select>
                    <select
                      value={filterMember}
                      onChange={(e) => setFilterMember(e.target.value)}
                      className="adm-input"
                      style={{ width: "auto" }}
                    >
                      <option value="all">All members</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace" }}>
                      {filteredFines.length} fine{filteredFines.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Fines List */}
                  <div className="adm-card">
                    {filteredFines.length === 0 ? (
                      <p className="adm-empty">No fines found.</p>
                    ) : (
                      filteredFines.map((fine) => {
                        const sc = STATUS_COLORS[fine.status] ?? { bg: "transparent", color: "#8B949E", border: "#30363D" };
                        return (
                          <div
                            key={fine.id}
                            className="adm-fine-row"
                            style={{ borderLeftColor: sc.color }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span className="adm-fine-member">{fine.member_name}</span>
                                <span style={{ color: "var(--text-dim)" }}>·</span>
                                <span className="adm-fine-type">{fine.fine_type}</span>
                              </div>
                              <p className="adm-fine-desc">{fine.description}</p>
                              {fine.notes && <p className="adm-fine-notes">{fine.notes}</p>}
                              <p className="adm-fine-meta">
                                {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}
                                {fine.amount != null && ` · $${fine.amount.toFixed(2)}`}
                              </p>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                              <span
                                className="adm-status-badge"
                                style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}
                              >
                                {fine.status}
                              </span>
                              <select
                                value={fine.status}
                                onChange={(e) => updateFineStatus(fine.id, e.target.value as FineStatus)}
                                className="adm-status-select"
                              >
                                <option value="pending">Pending</option>
                                <option value="upheld">Upheld</option>
                                <option value="dismissed">Dismissed</option>
                                <option value="paid">Paid</option>
                                <option value="labor">Labor</option>
                              </select>
                              <button onClick={() => deleteFine(fine.id)} className="adm-delete-btn">Delete</button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* OUTSTANDING TAB */}
              {tab === "outstanding" && (() => {
                const outstandingFines = fines.filter((f) => f.status === "pending" || f.status === "upheld");
                const byMember = members
                  .map((m) => {
                    const mFines = outstandingFines.filter((f) => f.member_id === m.id);
                    const totalOwed = mFines
                      .filter((f) => f.status === "upheld")
                      .reduce((sum, f) => sum + (f.amount ?? 0), 0);
                    return { member: m, fines: mFines, totalOwed };
                  })
                  .filter((g) => g.fines.length > 0)
                  .sort((a, b) => b.totalOwed - a.totalOwed);

                const grandTotal = byMember.reduce((sum, g) => sum + g.totalOwed, 0);

                return (
                  <div>
                    <div className="adm-summary">
                      <span style={{ color: "var(--text-muted)" }}>
                        {outstandingFines.length} outstanding fine{outstandingFines.length !== 1 ? "s" : ""} · {byMember.length} member{byMember.length !== 1 ? "s" : ""}
                      </span>
                      {grandTotal > 0 && (
                        <span style={{ color: "var(--red)", fontWeight: 600 }}>
                          ${grandTotal.toFixed(2)} total owed
                        </span>
                      )}
                    </div>

                    {byMember.length === 0 ? (
                      <p className="adm-empty">No outstanding fines.</p>
                    ) : (
                      byMember.map(({ member, fines: mFines, totalOwed }) => (
                        <div key={member.id} className="adm-member-block">
                          <div className="adm-member-block-header">
                            <span className="adm-member-block-name">{member.name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "capitalize", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.5px" }}>
                                {member.status}
                              </span>
                              {totalOwed > 0 && (
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: "var(--red)" }}>
                                  ${totalOwed.toFixed(2)} owed
                                </span>
                              )}
                            </div>
                          </div>
                          {mFines.map((fine) => {
                            const sc = STATUS_COLORS[fine.status] ?? { bg: "transparent", color: "#8B949E", border: "#30363D" };
                            return (
                              <div key={fine.id} className="adm-fine-row" style={{ borderLeftColor: sc.color }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{fine.fine_type}</p>
                                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{fine.description}</p>
                                  {fine.notes && <p className="adm-fine-notes">{fine.notes}</p>}
                                  <p className="adm-fine-meta">
                                    {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}
                                    {fine.amount != null && ` · $${fine.amount.toFixed(2)}`}
                                  </p>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                                  <span className="adm-status-badge" style={{ background: sc.bg, color: sc.color, borderColor: sc.border }}>
                                    {fine.status}
                                  </span>
                                  <select
                                    value={fine.status}
                                    onChange={(e) => updateFineStatus(fine.id, e.target.value as FineStatus)}
                                    className="adm-status-select"
                                  >
                                    <option value="pending">Pending</option>
                                    <option value="upheld">Upheld</option>
                                    <option value="dismissed">Dismissed</option>
                                    <option value="paid">Paid</option>
                                    <option value="labor">Labor</option>
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}

              {/* MEMBERS TAB */}
              {tab === "members" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <div className="adm-card">
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
                        <button type="submit" disabled={memberSubmitting} className="adm-btn">
                          {memberSubmitting ? "Adding…" : "Add Member"}
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="adm-card">
                    {members.length === 0 ? (
                      <p className="adm-empty">No members yet.</p>
                    ) : (
                      <table className="adm-table">
                        <thead>
                          <tr>
                            <th>Name</th>
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
                                <td>
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
                                  <button onClick={() => deleteMember(m.id)} className="adm-delete-btn">Delete</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* AUDIT LOG TAB */}
              {tab === "audit" && (
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
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
