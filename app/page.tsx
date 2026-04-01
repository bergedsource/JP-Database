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

        .page-wrap, .inner, .header, .crest-wrap, .org-label, .page-title, .page-subtitle, .divider, .section-title, .fine-card, .fine-type, .member-name, .member-status, .owed-banner {
          user-select: none;
          cursor: default;
        }

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
        }
        .crest-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
          position: relative;
          overflow: visible;
        }
        .crest-wrap img {
          animation: crestBurst 1s 0.5s cubic-bezier(0.16,1,0.3,1) both;
        }
        .org-label {
          font-family: 'Lato', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--gold-dim);
          margin-bottom: 10px;
          animation: sliceIn 0.5s 1.1s ease both;
        }
        .page-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(32px, 6vw, 48px);
          font-weight: 600;
          color: var(--cream);
          line-height: 1.1;
          letter-spacing: -0.5px;
          animation: sliceIn 0.5s 1.25s ease both;
        }
        .page-subtitle {
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px;
          font-weight: 400;
          font-style: italic;
          color: var(--gold);
          margin-top: 6px;
          letter-spacing: 0.3px;
          animation: sliceIn 0.5s 1.4s ease both;
        }
        .divider {
          height: 1.5px;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
          margin: 18px auto 0;
          animation: shimmerGrow 0.7s 1.55s ease both;
        }

        /* ── Search panel ── */
        .search-panel {
          background: rgba(20,20,20,0.8);
          border: 1px solid var(--black-border);
          border-radius: 14px;
          padding: 24px;
          backdrop-filter: blur(8px);
          margin-bottom: 36px;
          animation: fadeUp 0.6s 1.75s ease both;
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
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 20px 16px;
          border-radius: 12px;
          border: 1px solid var(--black-border);
          background: rgba(20,20,20,0.8);
          color: var(--cream);
          font-family: 'Lato', sans-serif;
          text-decoration: none;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
          cursor: pointer;
        }
        .pay-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(0,0,0,0.3);
        }
        .pay-btn-cashapp:hover { border-color: #00D632; box-shadow: 0 6px 24px rgba(0,214,50,0.15); }
        .pay-btn-venmo:hover   { border-color: #008CFF; box-shadow: 0 6px 24px rgba(0,140,255,0.15); }
        .pay-btn-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pay-btn-icon-cashapp { background: #00D632; }
        .pay-btn-icon-venmo   { background: #008CFF; }
        .pay-btn-name {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.3px;
          color: var(--cream);
        }
        .pay-btn-handle {
          font-size: 11px;
          font-weight: 400;
          color: var(--cream-dim);
          margin-top: -4px;
        }

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

        /* ── Entrance: scan line ── */
        @keyframes scanDown {
          0%   { top: 0; opacity: 0.9; }
          100% { top: 100vh; opacity: 0; }
        }
        .scan-line {
          position: fixed;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--gold), var(--gold-light), var(--gold), transparent);
          pointer-events: none;
          z-index: 999;
          animation: scanDown 0.9s cubic-bezier(0.4, 0, 0.6, 1) both;
        }

        /* ── Entrance: crest burst ── */
        @keyframes crestBurst {
          0%   { opacity: 0; clip-path: inset(50% 0 50% 0); filter: brightness(0); }
          45%  { clip-path: inset(0% 0 0% 0); filter: brightness(0.7) drop-shadow(0 0 28px rgba(207,181,59,0.95)); }
          100% { opacity: 1; clip-path: inset(0% 0 0% 0); filter: brightness(1) drop-shadow(0 4px 24px rgba(207,181,59,0.25)); }
        }

        /* ── Entrance: particles ── */
        @keyframes particleFly {
          0%   { opacity: 0; transform: translate(0,0) scale(0); }
          25%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.15); }
        }
        .particle {
          position: absolute;
          border-radius: 50%;
          background: var(--gold);
          pointer-events: none;
          animation: particleFly var(--dur, 1s) var(--delay, 0s) ease-out both;
        }

        /* ── Entrance: slice-in for text ── */
        @keyframes sliceIn {
          from { opacity: 0; clip-path: inset(50% 0 50% 0); }
          to   { opacity: 1; clip-path: inset(0% 0 0% 0); }
        }

        /* ── Entrance: shimmer divider ── */
        @keyframes shimmerGrow {
          0%   { width: 0; opacity: 0; }
          60%  { width: 80px; opacity: 1; }
          100% { width: 60px; opacity: 1; }
        }

        /* ── Fine cards / member header ── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Loading bar ── */
        @keyframes barSweep {
          0%   { left: -45%; width: 40%; }
          50%  { width: 58%; }
          100% { left: 110%; width: 40%; }
        }
        @keyframes loadFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .loading-bar-wrap {
          width: 260px;
          height: 3px;
          background: var(--black-border);
          border-radius: 3px;
          position: relative;
          overflow: hidden;
          animation: loadFadeIn 0.35s ease both;
        }
        .loading-bar {
          position: absolute;
          top: 0; height: 100%;
          background: linear-gradient(90deg, transparent, var(--gold-light), var(--gold), var(--gold-light), transparent);
          animation: barSweep 1.3s ease-in-out infinite;
        }
        .loading-bar-text {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 17px;
          color: var(--cream-dim);
          animation: loadFadeIn 0.35s 0.1s ease both;
        }
      `}</style>

      <div className="page-wrap">
        {/* Scan line */}
        <div className="scan-line" />

        <div className="inner">

          {/* ── Header ── */}
          <header className="header">
            <div className="crest-wrap">
              <AcaciaCrest />
              {/* Gold particles bursting from crest */}
              <div className="particle" style={{ width:5, height:5, top:"45%", left:"50%", "--tx":"-68px", "--ty":"-55px", "--delay":"0.65s", "--dur":"1.1s" } as React.CSSProperties} />
              <div className="particle" style={{ width:4, height:4, top:"45%", left:"50%", "--tx":"62px", "--ty":"-72px", "--delay":"0.7s", "--dur":"1.0s" } as React.CSSProperties} />
              <div className="particle" style={{ width:6, height:6, top:"45%", left:"50%", "--tx":"-30px", "--ty":"-90px", "--delay":"0.72s", "--dur":"1.2s" } as React.CSSProperties} />
              <div className="particle" style={{ width:4, height:4, top:"45%", left:"50%", "--tx":"78px", "--ty":"-38px", "--delay":"0.68s", "--dur":"1.1s" } as React.CSSProperties} />
              <div className="particle" style={{ width:5, height:5, top:"45%", left:"50%", "--tx":"-80px", "--ty":"-20px", "--delay":"0.75s", "--dur":"1.0s" } as React.CSSProperties} />
              <div className="particle" style={{ width:3, height:3, top:"45%", left:"50%", "--tx":"40px", "--ty":"-95px", "--delay":"0.78s", "--dur":"1.3s" } as React.CSSProperties} />
              <div className="particle" style={{ width:4, height:4, top:"45%", left:"50%", "--tx":"-50px", "--ty":"60px", "--delay":"0.73s", "--dur":"0.9s" } as React.CSSProperties} />
              <div className="particle" style={{ width:3, height:3, top:"45%", left:"50%", "--tx":"55px", "--ty":"52px", "--delay":"0.8s", "--dur":"1.0s" } as React.CSSProperties} />
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
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, padding:"52px 0 56px" }}>
                  <div className="loading-bar-wrap"><div className="loading-bar" /></div>
                  <p className="loading-bar-text">Retrieving records…</p>
                </div>
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
                          <a href="https://cash.app/$AcaciaOSU" target="_blank" rel="noopener noreferrer" className="pay-btn pay-btn-cashapp">
                            <div className="pay-btn-icon pay-btn-icon-cashapp">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M13.567 9.948c.492.115.963.298 1.4.542l.638-1.405a5.768 5.768 0 0 0-1.768-.6V7.5h-1.5v.993c-1.56.287-2.587 1.27-2.587 2.67 0 1.504 1.04 2.217 2.587 2.68v2.508c-.7-.118-1.38-.405-1.966-.84l-.713 1.387c.738.527 1.596.872 2.5.998V19h1.5v-1.128c1.695-.303 2.745-1.37 2.745-2.842 0-1.57-1.04-2.295-2.745-2.752V9.948zm-1.317 2.552c-.637-.224-.977-.513-.977-.977 0-.44.314-.795.977-.93v1.907zm1.5 4.088V14.27c.673.242.998.557.998 1.04 0 .492-.347.873-.998 1.278z"/><path fillRule="evenodd" clipRule="evenodd" d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6zm3-1.5A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 18 4.5H6z"/></svg>
                            </div>
                            <span className="pay-btn-name">Cash App</span>
                            <span className="pay-btn-handle">$AcaciaOSU</span>
                          </a>
                          <a href="https://venmo.com/Dillon-Berge" target="_blank" rel="noopener noreferrer" className="pay-btn pay-btn-venmo">
                            <div className="pay-btn-icon pay-btn-icon-venmo">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M18.5 3.5c.6 1 .9 2.1.9 3.3 0 3.3-2.8 7.6-5.1 10.6H9.6L7 4.1l4.7-.5 1.3 10.4c1.2-2 2.7-5.2 2.7-7.3 0-1.2-.2-2-.5-2.7l3.3-.5z"/></svg>
                            </div>
                            <span className="pay-btn-name">Venmo</span>
                            <span className="pay-btn-handle">@Dillon-Berge</span>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <p className="fine-meta" style={{ marginTop: 0 }}>
                Issued {new Date(fine.date_issued).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                &nbsp;·&nbsp;{fine.term}
              </p>
              <a
                href="https://docs.google.com/document/d/1zWRALtkvjH3Koyc46nlu_5EZwxMubr26-2142DOffTQ/edit"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: "var(--gold-dim)", textDecoration: "none", fontFamily: "'Lato', sans-serif", letterSpacing: "0.5px", whiteSpace: "nowrap", transition: "color 0.2s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--gold)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--gold-dim)")}
              >
                View Bylaw ↗
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
