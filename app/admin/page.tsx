"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Fine, FineStatus, FineType, Member } from "@/lib/types";

const FINE_TYPES: FineType[] = [
  "Conduct Unbecoming",
  "General Misconduct",
  "Misconduct Under Influence",
  "Missing Security at Function",
  "Missing Required Event",
  "Missing Recruitment/Work Week",
  "Missing Chapter Meeting",
  "Missing Exec Meeting",
  "Missing Yearbook/Composite",
  "Kitchen Duties",
  "House Clean",
  "Event House Clean",
  "Chores",
  "Missing Philanthropy Event",
  "Smoking",
  "Fire Alarm",
  "Formal Dinner Attire",
  "Grazers",
  "Social Probation Violation",
  "Committee Meeting Absence",
  "Missing JP Meeting",
  "Removal/Damage to House Property",
  "Removal/Damage to Personal Property",
  "Unauthorized Weapon Use",
  "Other",
];

const STATUS_STYLES: Record<FineStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  upheld: "bg-red-100 text-red-800",
  dismissed: "bg-green-100 text-green-800",
  paid: "bg-blue-100 text-blue-800",
  labor: "bg-purple-100 text-purple-800",
};

type Tab = "fines" | "members";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("fines");
  const [members, setMembers] = useState<Member[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [filterStatus, setFilterStatus] = useState<FineStatus | "all">("all");
  const [filterMember, setFilterMember] = useState<string>("all");
  const [loading, setLoading] = useState(true);

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
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: m }, { data: f }] = await Promise.all([
      supabase.from("members").select("*").order("name"),
      supabase
        .from("fines")
        .select("*, members(name)")
        .order("date_issued", { ascending: false }),
    ]);
    setMembers(m ?? []);
    setFines(
      (f ?? []).map((fine: Fine & { members?: { name: string } }) => ({
        ...fine,
        member_name: fine.members?.name,
      }))
    );
    setLoading(false);
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
      setFineForm({
        member_id: "",
        fine_type: "General Misconduct",
        description: "",
        amount: "",
        term: "",
        date_issued: new Date().toISOString().split("T")[0],
        notes: "",
      });
      await loadData();
    }
    setFineSubmitting(false);
  }

  async function updateFineStatus(id: string, status: FineStatus) {
    await supabase
      .from("fines")
      .update({
        status,
        date_resolved: ["paid", "dismissed", "labor"].includes(status)
          ? new Date().toISOString().split("T")[0]
          : null,
      })
      .eq("id", id);
    await loadData();
  }

  async function deleteFine(id: string) {
    if (!confirm("Delete this fine?")) return;
    await supabase.from("fines").delete().eq("id", id);
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
      setMemberForm({ name: "", status: "active" });
      await loadData();
    }
    setMemberSubmitting(false);
  }

  async function updateMemberStatus(id: string, status: Member["status"]) {
    await supabase.from("members").update({ status }).eq("id", id);
    await loadData();
  }

  async function deleteMember(id: string) {
    if (!confirm("Delete this member and all their fines?")) return;
    await supabase.from("fines").delete().eq("member_id", id);
    await supabase.from("members").delete().eq("id", id);
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
          {(["fines", "members"] as Tab[]).map((t) => (
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
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Member</label>
                      <select
                        value={fineForm.member_id}
                        onChange={(e) =>
                          setFineForm({ ...fineForm, member_id: e.target.value })
                        }
                        required
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">Select member...</option>
                        {members
                          .filter((m) => m.status === "active" || m.status === "pledge")
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.status})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fine Type</label>
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
                      <label className="block text-xs text-gray-500 mb-1">Description</label>
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
                      <label className="block text-xs text-gray-500 mb-1">Term</label>
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
                      <label className="block text-xs text-gray-500 mb-1">Date Issued</label>
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
          </>
        )}
      </div>
    </main>
  );
}
