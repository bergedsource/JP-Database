"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Fine, Member } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  upheld: "bg-red-100 text-red-800",
  dismissed: "bg-green-100 text-green-800",
  paid: "bg-blue-100 text-blue-800",
  labor: "bg-purple-100 text-purple-800",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const supabase = createClient();

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setSelected(null);
    setFines([]);
    setSearched(true);

    let q = supabase
      .from("members")
      .select("*")
      .ilike("name", `%${query.trim()}%`)
      .order("name");

    if (filterStatus !== "all") {
      q = q.eq("status", filterStatus);
    }

    const { data } = await q;
    setResults(data ?? []);
    setLoading(false);
  }

  async function selectMember(member: Member) {
    setSelected(member);
    setLoading(true);

    const { data } = await supabase
      .from("fines")
      .select("*")
      .eq("member_id", member.id)
      .order("date_issued", { ascending: false });

    setFines(data ?? []);
    setLoading(false);
  }

  const currentFines = fines.filter((f) =>
    ["pending", "upheld"].includes(f.status)
  );
  const pastFines = fines.filter((f) =>
    ["dismissed", "paid", "labor"].includes(f.status)
  );
  const totalOwed = currentFines
    .filter((f) => f.status === "upheld" && f.amount)
    .reduce((sum, f) => sum + (f.amount ?? 0), 0);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            Acacia Fraternity — Oregon State
          </h1>
          <p className="text-gray-500 mt-2">JP Fine Lookup</p>
        </div>

        <div className="flex gap-2 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search your name..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="pledge">Pledge</option>
            <option value="live-out">Live-out</option>
            <option value="alumni">Alumni</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            onClick={search}
            disabled={loading}
            className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
          >
            Search
          </button>
        </div>

        {searched && !selected && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {results.length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">
                No members found matching &quot;{query}&quot;
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => selectMember(m)}
                      className="w-full text-left px-5 py-3 hover:bg-gray-50 flex justify-between items-center"
                    >
                      <span className="font-medium text-gray-800">{m.name}</span>
                      <span className="text-xs text-gray-400 capitalize">
                        {m.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {selected && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selected.name}
                </h2>
                <p className="text-sm text-gray-400 capitalize">{selected.status}</p>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setFines([]);
                  setSearched(false);
                  setQuery("");
                  setResults([]);
                }}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Back
              </button>
            </div>

            {loading ? (
              <p className="text-center text-gray-400 py-10 text-sm">Loading...</p>
            ) : (
              <>
                {totalOwed > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3 mb-6 text-sm text-red-700">
                    Total currently owed:{" "}
                    <span className="font-bold">${totalOwed.toFixed(2)}</span>
                  </div>
                )}

                <FineSection title="Current Fines" fines={currentFines} />
                <FineSection title="Past Fines" fines={pastFines} />

                {fines.length === 0 && (
                  <p className="text-center text-gray-400 py-10 text-sm">
                    No fines on record.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function FineSection({ title, fines }: { title: string; fines: Fine[] }) {
  if (fines.length === 0) return null;

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="space-y-3">
        {fines.map((fine) => (
          <div
            key={fine.id}
            className="bg-white border border-gray-200 rounded-xl px-5 py-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-gray-800">{fine.fine_type}</p>
                <p className="text-sm text-gray-500 mt-0.5">{fine.description}</p>
                {fine.notes && (
                  <p className="text-xs text-gray-400 mt-1 italic">{fine.notes}</p>
                )}
              </div>
              <div className="text-right ml-4 shrink-0">
                <span
                  className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                    STATUS_STYLES[fine.status]
                  }`}
                >
                  {fine.status}
                </span>
                {fine.amount != null && (
                  <p className="text-sm font-semibold text-gray-700 mt-1">
                    ${fine.amount.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Issued: {new Date(fine.date_issued).toLocaleDateString()} · Term:{" "}
              {fine.term}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
