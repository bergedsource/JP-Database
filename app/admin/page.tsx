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

const STATUS_STYLES: Record<FineStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  upheld: "bg-red-100 text-red-800",
  dismissed: "bg-green-100 text-green-800",
  paid: "bg-blue-100 text-blue-800",
  labor: "bg-purple-100 text-purple-800",
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
    member_id: "",
    fine_type: "General Misconduct" as FineType,
    description: "",
    amount: "",
    term: "",
    date_issued: new Date().toISOString().split("T")[0],
    notes: "",
  });
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
    setFineSubmitting(true);
    setFineError("");

    const { error } = await supabase.from("fines").insert({
      member_id: fineForm.member_id,
      fine_type: fineForm.fine_type,
      description: fineForm.description,
      amount: fineForm.amount ? parseFloat(fineForm.amount) : null,
      status: "pending",
      term: fineForm.term,
      date_issued: fineForm.date_issued,
      notes: fineForm.notes || null,
    });

    if (error) {
      setFineError(error.message);
    } else {
      const memberName = members.find((m) => m.id === fineForm.member_id)?.name ?? fineForm.member_id;
      await log("Issued Fine", `${fineForm.fine_type} against ${memberName} — "${fineForm.description}" (${fineForm.term}${fineForm.amount ? `, $${fineForm.amount}` : ""})`);
      setFineForm({
        member_id: "",
        fine_type: "General Misconduct (§11-020)",
        description: "",
        amount: "",
        term: "",
        date_issued: new Date().toISOString().split("T")[0],
        notes: "",
      });
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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">JP Admin</h1>
            <p className="text-sm text-gray-400">Acacia — Oregon State</p>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-gray-100 p-1 rounded-lg w-fit">
          {(["fines", "outstanding", "members", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <>
            {/* FINES TAB */}
            {tab === "fines" && (
              <div className="space-y-8">
                {/* Add Fine Form */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h2 className="font-semibold text-gray-800 mb-4">Issue Fine</h2>
                  <form onSubmit={submitFine} className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <label className="block text-xs text-gray-500 mb-1">Member <span className="text-red-500">(required)</span></label>
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => {
                          setMemberSearch(e.target.value);
                          setFineForm({ ...fineForm, member_id: "" });
                          setShowMemberSuggestions(true);
                        }}
                        onFocus={() => setShowMemberSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowMemberSuggestions(false), 150)}
                        placeholder="Search name..."
                        autoComplete="off"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                      />
                      {/* Hidden required input to trigger form validation */}
                      <input type="hidden" value={fineForm.member_id} required />
                      {showMemberSuggestions && memberSearch.trim() && (
                        <ul className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {members
                            .filter(
                              (m) =>
                                (m.status === "active" || m.status === "pledge") &&
                                m.name.toLowerCase().includes(memberSearch.toLowerCase())
                            )
                            .map((m) => (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  onMouseDown={() => {
                                    setFineForm({ ...fineForm, member_id: m.id });
                                    setMemberSearch(m.name);
                                    setShowMemberSuggestions(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between items-center"
                                >
                                  <span className="font-medium text-gray-800">{m.name}</span>
                                  <span className="text-xs text-gray-400 capitalize">{m.status}</span>
                                </button>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fine Type <span className="text-red-500">(required)</span></label>
                      <select
                        value={fineForm.fine_type}
                        onChange={(e) =>
                          setFineForm({
                            ...fineForm,
                            fine_type: e.target.value as FineType,
                          })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        {FINE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Description <span className="text-red-500">(required)</span></label>
                      <input
                        type="text"
                        value={fineForm.description}
                        onChange={(e) =>
                          setFineForm({ ...fineForm, description: e.target.value })
                        }
                        required
                        placeholder="Brief description of the offense"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Proposed Amount ($) <span className="text-gray-400">optional</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={fineForm.amount}
                        onChange={(e) =>
                          setFineForm({ ...fineForm, amount: e.target.value })
                        }
                        placeholder="0.00"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Term <span className="text-red-500">(required)</span></label>
                      <input
                        type="text"
                        value={fineForm.term}
                        onChange={(e) =>
                          setFineForm({ ...fineForm, term: e.target.value })
                        }
                        required
                        placeholder="e.g. Fall 2025"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Date Issued <span className="text-red-500">(required)</span></label>
                      <input
                        type="date"
                        value={fineForm.date_issued}
                        onChange={(e) =>
                          setFineForm({ ...fineForm, date_issued: e.target.value })
                        }
                        required
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Notes <span className="text-gray-400">optional</span>
                      </label>
                      <input
                        type="text"
                        value={fineForm.notes}
                        onChange={(e) =>
                          setFineForm({ ...fineForm, notes: e.target.value })
                        }
                        placeholder="Any additional context"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>

                    {fineError && (
                      <p className="col-span-2 text-sm text-red-500">{fineError}</p>
                    )}

                    <div className="col-span-2">
                      <button
                        type="submit"
                        disabled={fineSubmitting}
                        className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
                      >
                        {fineSubmitting ? "Issuing..." : "Issue Fine"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Filters */}
                <div className="flex gap-3">
                  <select
                    value={filterStatus}
                    onChange={(e) =>
                      setFilterStatus(e.target.value as FineStatus | "all")
                    }
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
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
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <option value="all">All members</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>

                  <span className="text-sm text-gray-400 self-center">
                    {filteredFines.length} fine{filteredFines.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Fines List */}
                <div className="space-y-3">
                  {filteredFines.length === 0 ? (
                    <p className="text-gray-400 text-sm">No fines found.</p>
                  ) : (
                    filteredFines.map((fine) => (
                      <div
                        key={fine.id}
                        className="bg-white border border-gray-200 rounded-xl px-5 py-4"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-800">
                                {fine.member_name}
                              </span>
                              <span className="text-gray-300">·</span>
                              <span className="text-sm text-gray-600">
                                {fine.fine_type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {fine.description}
                            </p>
                            {fine.notes && (
                              <p className="text-xs text-gray-400 mt-1 italic">
                                {fine.notes}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}
                              {fine.amount != null && ` · $${fine.amount.toFixed(2)}`}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                                STATUS_STYLES[fine.status]
                              }`}
                            >
                              {fine.status}
                            </span>

                            <select
                              value={fine.status}
                              onChange={(e) =>
                                updateFineStatus(
                                  fine.id,
                                  e.target.value as FineStatus
                                )
                              }
                              className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-600"
                            >
                              <option value="pending">Pending</option>
                              <option value="upheld">Upheld</option>
                              <option value="dismissed">Dismissed</option>
                              <option value="paid">Paid</option>
                              <option value="labor">Labor</option>
                            </select>

                            <button
                              onClick={() => deleteFine(fine.id)}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
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
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {outstandingFines.length} outstanding fine{outstandingFines.length !== 1 ? "s" : ""} across {byMember.length} member{byMember.length !== 1 ? "s" : ""}
                    </p>
                    {grandTotal > 0 && (
                      <span className="text-sm font-semibold text-red-600">
                        ${grandTotal.toFixed(2)} total owed
                      </span>
                    )}
                  </div>

                  {byMember.length === 0 ? (
                    <p className="text-gray-400 text-sm">No outstanding fines.</p>
                  ) : (
                    byMember.map(({ member, fines: mFines, totalOwed }) => (
                      <div key={member.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                          <span className="font-semibold text-gray-800">{member.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 capitalize">{member.status}</span>
                            {totalOwed > 0 && (
                              <span className="text-sm font-semibold text-red-600">${totalOwed.toFixed(2)} owed</span>
                            )}
                          </div>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {mFines.map((fine) => (
                            <div key={fine.id} className="flex items-start justify-between px-5 py-3 gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{fine.fine_type}</p>
                                <p className="text-xs text-gray-500">{fine.description}</p>
                                {fine.notes && <p className="text-xs text-gray-400 italic mt-0.5">{fine.notes}</p>}
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {new Date(fine.date_issued).toLocaleDateString()} · {fine.term}
                                  {fine.amount != null && ` · $${fine.amount.toFixed(2)}`}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2 shrink-0">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[fine.status]}`}>
                                  {fine.status}
                                </span>
                                <select
                                  value={fine.status}
                                  onChange={(e) => updateFineStatus(fine.id, e.target.value as FineStatus)}
                                  className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-600"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="upheld">Upheld</option>
                                  <option value="dismissed">Dismissed</option>
                                  <option value="paid">Paid</option>
                                  <option value="labor">Labor</option>
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })()}

            {/* MEMBERS TAB */}
            {tab === "members" && (
              <div className="space-y-8">
                {/* Add Member Form */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <h2 className="font-semibold text-gray-800 mb-4">Add Member</h2>
                  <form onSubmit={submitMember} className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={memberForm.name}
                        onChange={(e) =>
                          setMemberForm({ ...memberForm, name: e.target.value })
                        }
                        required
                        placeholder="First Last"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Status</label>
                      <select
                        value={memberForm.status}
                        onChange={(e) =>
                          setMemberForm({
                            ...memberForm,
                            status: e.target.value as Member["status"],
                          })
                        }
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="active">Active</option>
                      <option value="pledge">Pledge</option>
                      <option value="live-out">Live-out</option>
                      <option value="alumni">Alumni</option>
                      <option value="inactive">Inactive</option>
                      <option value="resident-advisor">Resident Advisor</option>
                      </select>
                    </div>
                    {memberError && (
                      <p className="text-sm text-red-500">{memberError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={memberSubmitting}
                      className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50 h-[38px]"
                    >
                      {memberSubmitting ? "Adding..." : "Add"}
                    </button>
                  </form>
                </div>

                {/* Members List */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {members.length === 0 ? (
                    <p className="text-center text-gray-400 py-10 text-sm">
                      No members yet.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Name
                          </th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Status
                          </th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Fines
                          </th>
                          <th />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {members.map((m) => {
                          const memberFines = fines.filter(
                            (f) => f.member_id === m.id
                          );
                          const open = memberFines.filter((f) =>
                            ["pending", "upheld"].includes(f.status)
                          ).length;
                          return (
                            <tr key={m.id}>
                              <td className="px-5 py-3 font-medium text-gray-800">
                                {m.name}
                              </td>
                              <td className="px-5 py-3">
                                <select
                                  value={m.status}
                                  onChange={(e) =>
                                    updateMemberStatus(
                                      m.id,
                                      e.target.value as Member["status"]
                                    )
                                  }
                                  className="border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-600"
                                >
                                  <option value="active">Active</option>
                                  <option value="pledge">Pledge</option>
                                  <option value="live-out">Live-out</option>
                                  <option value="alumni">Alumni</option>
                                  <option value="inactive">Inactive</option>
                                  <option value="resident-advisor">Resident Advisor</option>
                                </select>
                              </td>
                              <td className="px-5 py-3 text-gray-500">
                                {open > 0 ? (
                                  <span className="text-red-600 font-medium">
                                    {open} open
                                  </span>
                                ) : (
                                  <span className="text-gray-400">None open</span>
                                )}
                                {memberFines.length > 0 &&
                                  ` (${memberFines.length} total)`}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <button
                                  onClick={() => deleteMember(m.id)}
                                  className="text-xs text-red-400 hover:text-red-600"
                                >
                                  Delete
                                </button>
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
              <div>
                <h2 className="font-semibold text-gray-800 mb-4">Audit Log</h2>
                {auditLogs.length === 0 ? (
                  <p className="text-gray-400 text-sm">No actions recorded yet.</p>
                ) : (
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">When</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                              {new Date(log.created_at).toLocaleDateString()}{" "}
                              <span className="text-gray-400">
                                {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-gray-600">{log.admin_email}</td>
                            <td className="px-5 py-3 font-medium text-gray-800 whitespace-nowrap">{log.action}</td>
                            <td className="px-5 py-3 text-gray-600">{log.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
