"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Fine, Member } from "@/lib/types";

const STATUS_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  pending:   { bg: "#FEF3C7", color: "#78350F", border: "#F59E0B" },
  upheld:    { bg: "#FEE2E2", color: "#7F1D1D", border: "#EF4444" },
  dismissed: { bg: "#D1FAE5", color: "#064E3B", border: "#10B981" },
  paid:      { bg: "#DBEAFE", color: "#1E3A5F", border: "#3B82F6" },
  labor:     { bg: "#EDE9FE", color: "#4C1D95", border: "#8B5CF6" },
};

function AcaciaCrest() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/crest.webp" alt="Acacia Fraternity Crest" width={160} height={213} style={{ objectFit: "contain" }} />
  );
}

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
      .in("status", ["active", "pledge"])
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
    if (query.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        let q = supabase
          .from("members")
          .select("*")
          .ilike("name", `%${query.trim()}%`)
          .in("status", ["active", "pledge"])
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

  const currentFines = fines.filter((f) => ["pending", "upheld"].includes(f.status));
  const pastFines = fines.filter((f) => ["dismissed", "paid", "labor"].includes(f.status));
  const totalOwed = currentFines
    .filter((f) => f.status === "upheld" && f.amount)
    .reduce((sum, f) => sum + (f.amount ?? 0), 0);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Lato:wght@300;400;700&display=swap');

        :root {
          --black: #0A0A0A;
          --black-card: #141414;
          --black-border: #2A2A2A;
          --gold: #CFB53B;
          --gold-light: #E2CC6A;
          --gold-dim: #8A7520;
          --cream: #F0E8D0;
          --cream-dim: #A89870;
          --white: #FFFFFF;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background-color: var(--black);
          font-family: 'Lato', sans-serif;
          color: var(--cream);
          min-height: 100vh;
        }

        .page-wrap {
          min-height: 100vh;
          background:
            radial-gradient(ellipse at 30% 0%, rgba(207,181,59,0.07) 0%, transparent 55%),
            radial-gradient(ellipse at 70% 100%, rgba(207,181,59,0.04) 0%, transparent 50%),
            linear-gradient(160deg, #0A0A0A 0%, #111111 50%, #0A0A0A 100%);
        }

        .inner {
          max-width: 680px;
          margin: 0 auto;
          padding: 56px 20px 80px;
        }

        /* ── Header ── */
        .header {
          text-align: center;
          margin-bottom: 48px;
          animation: fadeDown 0.7s ease both;
        }
        .crest-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
          filter: drop-shadow(0 4px 24px rgba(201,168,76,0.25));
        }
        .org-label {
          font-family: 'Lato', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--gold-dim);
          margin-bottom: 10px;
        }
        .page-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(32px, 6vw, 48px);
          font-weight: 600;
          color: var(--cream);
          line-height: 1.1;
          letter-spacing: -0.5px;
        }
        .page-subtitle {
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
          font-weight: 400;
          font-style: italic;
          color: var(--gold);
          margin-top: 6px;
          letter-spacing: 0.3px;
        }
        .divider {
          width: 60px;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          margin: 18px auto 0;
        }

        /* ── Search panel ── */
        .search-panel {
          background: rgba(20,20,20,0.8);
          border: 1px solid var(--black-border);
          border-radius: 14px;
          padding: 24px;
          backdrop-filter: blur(8px);
          margin-bottom: 36px;
          animation: fadeUp 0.7s 0.15s ease both;
          box-shadow: 0 8px 40px rgba(0,0,0,0.4);
        }
        .search-label {
          font-family: 'Lato', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--gold-dim);
          margin-bottom: 12px;
          display: block;
        }
        .search-row {
          display: flex;
          gap: 10px;
          position: relative;
        }
        .search-input-wrap {
          flex: 1;
          position: relative;
        }
        .search-input {
          width: 100%;
          background: rgba(10,10,10,0.9);
          border: 1.5px solid var(--black-border);
          border-radius: 8px;
          padding: 12px 16px;
          font-family: 'Lato', sans-serif;
          font-size: 15px;
          color: var(--cream);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-input::placeholder { color: var(--cream-dim); opacity: 0.6; }
        .search-input:focus {
          border-color: var(--gold);
          box-shadow: 0 0 0 3px rgba(201,168,76,0.12);
        }
        .filter-select {
          background: rgba(10,10,10,0.9);
          border: 1.5px solid var(--black-border);
          border-radius: 8px;
          padding: 12px 14px;
          font-family: 'Lato', sans-serif;
          font-size: 14px;
          color: var(--cream);
          outline: none;
          cursor: pointer;
          transition: border-color 0.2s;
          min-width: 100px;
        }
        .filter-select:focus { border-color: var(--gold); }
        .filter-select option { background: #111111; }

        /* Autocomplete dropdown */
        .suggestions {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          background: #141414;
          border: 1px solid var(--black-border);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
          z-index: 50;
        }
        .suggestion-item {
          width: 100%;
          text-align: left;
          padding: 12px 18px;
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s;
          border-bottom: 1px solid rgba(42,42,42,0.6);
        }
        .suggestion-item:last-child { border-bottom: none; }
        .suggestion-item:hover { background: rgba(207,181,59,0.08); }
        .suggestion-name {
          font-family: 'Lato', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: var(--cream);
        }
        .suggestion-status {
          font-size: 11px;
          font-weight: 400;
          color: var(--gold-dim);
          text-transform: capitalize;
          letter-spacing: 0.5px;
        }

        /* ── Member header ── */
        .member-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 28px;
          animation: fadeUp 0.4s ease both;
        }
        .member-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 30px;
          font-weight: 600;
          color: var(--cream);
          line-height: 1.1;
        }
        .member-status {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--gold);
          margin-top: 4px;
        }
        .back-btn {
          background: transparent;
          border: 1px solid var(--green-border);
          border-radius: 7px;
          padding: 8px 16px;
          font-family: 'Lato', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--cream-dim);
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
          white-space: nowrap;
          margin-top: 4px;
        }
        .back-btn:hover { border-color: var(--gold); color: var(--gold); }

        /* ── Fine sections ── */
        .section-title {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--gold-dim);
          margin-bottom: 14px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--black-border);
        }

        /* ── Owed banner ── */
        .owed-banner {
          background: linear-gradient(135deg, rgba(127,29,29,0.35) 0%, rgba(153,27,27,0.2) 100%);
          border: 1px solid rgba(239,68,68,0.35);
          border-radius: 10px;
          padding: 14px 20px;
          margin-bottom: 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          animation: fadeUp 0.4s 0.05s ease both;
        }
        .owed-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #FCA5A5;
        }
        .owed-amount {
          font-family: 'Cormorant Garamond', serif;
          font-size: 26px;
          font-weight: 700;
          color: #F87171;
        }

        .fine-list { margin-bottom: 36px; }

        /* ── Fine card ── */
        .fine-card {
          background: rgba(20,20,20,0.8);
          border: 1px solid var(--black-border);
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 10px;
          backdrop-filter: blur(4px);
          transition: border-color 0.2s, box-shadow 0.2s;
          animation: fadeUp 0.35s ease both;
        }
        .fine-card:hover {
          border-color: rgba(207,181,59,0.3);
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .fine-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .fine-type {
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
          font-weight: 600;
          color: var(--cream);
          line-height: 1.2;
        }
        .fine-desc {
          font-size: 13px;
          color: var(--cream-dim);
          margin-top: 4px;
          line-height: 1.4;
        }
        .fine-notes {
          font-size: 12px;
          color: var(--gold-dim);
          margin-top: 5px;
          font-style: italic;
        }
        .fine-right {
          text-align: right;
          flex-shrink: 0;
        }
        .status-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 20px;
          border-width: 1px;
          border-style: solid;
        }
        .fine-amount {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 700;
          color: var(--cream);
          margin-top: 6px;
        }
        .fine-meta {
          font-size: 11px;
          color: var(--gold-dim);
          margin-top: 12px;
          letter-spacing: 0.3px;
        }

        /* ── Payment buttons ── */
        .pay-section {
          margin-bottom: 28px;
          animation: fadeUp 0.4s 0.08s ease both;
        }
        .pay-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--gold-dim);
          margin-bottom: 10px;
          display: block;
        }
        .pay-buttons {
          display: flex;
          gap: 10px;
        }
        .pay-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 16px;
          border-radius: 9px;
          border: 1px solid var(--black-border);
          background: rgba(20,20,20,0.8);
          color: var(--cream);
          font-family: 'Lato', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.3px;
          text-decoration: none;
          transition: border-color 0.2s, background 0.2s, color 0.2s;
          cursor: pointer;
        }
        .pay-btn:hover {
          border-color: var(--gold);
          background: rgba(207,181,59,0.07);
          color: var(--gold);
        }
        .pay-btn svg { flex-shrink: 0; }

        .loading-text {
          text-align: center;
          color: var(--cream-dim);
          padding: 48px 0;
          font-style: italic;
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
        }
        .empty-text {
          text-align: center;
          color: var(--cream-dim);
          padding: 48px 0;
          font-style: italic;
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
        }

        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="page-wrap">
        <div className="inner">

          {/* ── Header ── */}
          <header className="header">
            <div className="crest-wrap">
              <AcaciaCrest />
            </div>
            <p className="org-label">Acacia Fraternity</p>
            <h1 className="page-title">Jurisprudence Portal</h1>
            <p className="page-subtitle">Oregon State Chapter</p>
            <div className="divider" />
          </header>

          {/* ── Search ── */}
          <div className="search-panel" ref={wrapperRef}>
            <span className="search-label">Member Fine Lookup</span>
            <div className="search-row">
              <div className="search-input-wrap">
                <input
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Start typing your name…"
                  autoComplete="off"
                  className="search-input"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions">
                    {suggestions.map((m) => (
                      <li key={m.id}>
                        <button
                          onMouseDown={() => selectMember(m)}
                          className="suggestion-item"
                        >
                          <span className="suggestion-name">{m.name}</span>
                          <span className="suggestion-status">{m.status}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <select
                value={filterStatus}
                onChange={handleFilterChange}
                className="filter-select"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="pledge">Pledge</option>
              </select>
            </div>
          </div>

          {/* ── Member detail ── */}
          {selected && (
            <div>
              <div className="member-header">
                <div>
                  <h2 className="member-name">{selected.name}</h2>
                  <p className="member-status">{selected.status}</p>
                </div>
                <button
                  className="back-btn"
                  onClick={() => {
                    setSelected(null);
                    setFines([]);
                    setQuery("");
                    setSuggestions([]);
                  }}
                >
                  ← Back
                </button>
              </div>

              {loading ? (
                <p className="loading-text">Loading records…</p>
              ) : (
                <>
                  {totalOwed > 0 && (
                    <>
                      <div className="owed-banner">
                        <span className="owed-label">Balance Due</span>
                        <span className="owed-amount">${totalOwed.toFixed(2)}</span>
                      </div>
                      <div className="pay-section">
                        <span className="pay-label">Pay Your Balance</span>
                        <div className="pay-buttons">
                          <a href="https://cash.app/$AcaciaOSU" target="_blank" rel="noopener noreferrer" className="pay-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.304 12.934l.896-5.58A1.3 1.3 0 0 0 18.914 6H5.086a1.3 1.3 0 0 0-1.286 1.354l.896 5.58A1.3 1.3 0 0 0 5.982 14h12.036a1.3 1.3 0 0 0 1.286-1.066zM12 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/><path d="M14.121 16.5H9.879A.879.879 0 0 0 9 17.379v.242C9 18.385 9.615 19 10.379 19h3.242C14.385 19 15 18.385 15 17.621v-.242a.879.879 0 0 0-.879-.879z"/></svg>
                            Cash App · $AcaciaOSU
                          </a>
                          <a href="https://venmo.com/Dillon-Berge" target="_blank" rel="noopener noreferrer" className="pay-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3C17.9 3 16.6 4 15.9 5.6c-.3.7-.5 1.5-.5 2.4 0 2 .9 3.8 1.7 5.2L13.3 21H9.4L6 7.2C5.2 4.7 3.9 3.4 2 3l-.2 1.6c1.2.3 2 1.3 2.6 3.3l3.1 12.7h6.2l4.3-10.6c-.9-1.5-1.7-3.3-1.7-5.4 0-.7.1-1.3.4-1.9.3-.8 1-1.3 1.8-1.3.5 0 .9.2 1.2.5l1-1.3C20.4 3.2 20 3 19.5 3z"/></svg>
                            Venmo · @Dillon-Berge
                          </a>
                        </div>
                      </div>
                    </>
                  )}

                  <FineSection title="Current Fines" fines={currentFines} />
                  <FineSection title="Past Fines" fines={pastFines} />

                  {fines.length === 0 && (
                    <p className="empty-text">No fines on record.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FineSection({ title, fines }: { title: string; fines: Fine[] }) {
  if (fines.length === 0) return null;

  return (
    <div className="fine-list">
      <h3 className="section-title">{title}</h3>
      {fines.map((fine, i) => {
        const cfg = STATUS_CONFIG[fine.status] ?? { bg: "#e5e7eb", color: "#374151", border: "#9ca3af" };
        return (
          <div key={fine.id} className="fine-card" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="fine-card-top">
              <div>
                <p className="fine-type">{fine.fine_type}</p>
                <p className="fine-desc">{fine.description}</p>
              </div>
              <div className="fine-right">
                <span
                  className="status-badge"
                  style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
                >
                  {fine.status}
                </span>
                {fine.amount != null && (
                  <p className="fine-amount">${fine.amount.toFixed(2)}</p>
                )}
              </div>
            </div>
            <p className="fine-meta">
              Issued {new Date(fine.date_issued).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              &nbsp;·&nbsp;{fine.term}
            </p>
          </div>
        );
      })}
    </div>
  );
}
