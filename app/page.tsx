"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Fine, Member } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-200 text-yellow-900",
  upheld: "bg-red-200 text-red-900",
  dismissed: "bg-green-200 text-green-900",
  paid: "bg-blue-200 text-blue-900",
  labor: "bg-purple-200 text-purple-900",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function fetchSuggestions(value: string) {
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let q = supabase
      .from("members")
      .select("*")
      .ilike("name", `%${value.trim()}%`)
      .order("name")
      .limit(8);

    if (filterStatus !== "all") {
      q = q.eq("status", filterStatus);
    }

    const { data } = await q;
    setSuggestions(data ?? []);
    setShowSuggestions(true);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    setSelected(null);
    setFines([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 200);
  }

  async function selectMember(member: Member) {
    setQuery(member.name);
    setShowSuggestions(false);
    setSuggestions([]);
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

  function handleFilterChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setFilterStatus(e.target.value);
    // Re-fetch suggestions with new filter if there's a query
    if (query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        let q = supabase
          .from("members")
          .select("*")
          .ilike("name", `%${query.trim()}%`)
          .order("name")
          .limit(8);
        if (e.target.value !== "all") {
          q = q.eq("status", e.target.value);
        }
        const { data } = await q;
        setSuggestions(data ?? []);
        setShowSuggestions(true);
      }, 100);
    }
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
          <p className="text-gray-700 mt-2">JP Fine Lookup</p>
        </div>

        <div className="flex gap-2 mb-8" ref={wrapperRef}>
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Start typing your name..."
              autoComplete="off"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((m) => (
                  <li key={m.id}>
                    <button
                      onMouseDown={() => selectMember(m)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex justify-between items-center text-sm"
                    >
                      <span className="font-medium text-gray-800">{m.name}</span>
                      <span className="text-xs text-gray-600 capitalize">{m.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select
            value={filterStatus}
            onChange={handleFilterChange}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="pledge">Pledge</option>
            <option value="live-out">Live-out</option>
            <option value="alumni">Alumni</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {selected && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selected.name}
                </h2>
                <p className="text-sm text-gray-600 capitalize">{selected.status}</p>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setFines([]);
                  setQuery("");
                  setSuggestions([]);
                }}
                className="text-sm text-gray-600 hover:text-gray-600"
              >
                Back
              </button>
            </div>

            {loading ? (
              <p className="text-center text-gray-600 py-10 text-sm">Loading...</p>
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
                  <p className="text-center text-gray-600 py-10 text-sm">
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
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
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
                <p className="text-sm text-gray-700 mt-0.5">{fine.description}</p>
                {fine.notes && (
                  <p className="text-xs text-gray-600 mt-1 italic">{fine.notes}</p>
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
            <p className="text-xs text-gray-600 mt-2">
              Issued: {new Date(fine.date_issued).toLocaleDateString()} · Term:{" "}
              {fine.term}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
