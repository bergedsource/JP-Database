"use client";

import { useState, useRef, useEffect } from "react";
import { Cormorant_Garamond, Lato } from "next/font/google";
import type { Fine, Member } from "@/lib/types";
import type { JpInfo } from "@/lib/jp-info";
import JpInfoCard from "./JpInfoCard";

// Self-hosted by next/font so the CSP's font-src 'self' allows them.
const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-serif" });
const sans = Lato({ subsets: ["latin"], weight: ["300", "400", "700"], variable: "--font-sans" });

const STATUS_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  pending:    { bg: "#FEF3C7", color: "#78350F", border: "#F59E0B" },
  upheld:     { bg: "#FEE2E2", color: "#7F1D1D", border: "#EF4444" },
  dismissed:  { bg: "#D1FAE5", color: "#064E3B", border: "#10B981" },
  overturned: { bg: "#FFEDD5", color: "#7C2D12", border: "#F97316" },
  paid:       { bg: "#DBEAFE", color: "#1E3A5F", border: "#3B82F6" },
  labor:      { bg: "#EDE9FE", color: "#4C1D95", border: "#8B5CF6" },
  added_to_dues: { bg: "#CCFBF1", color: "#134E4A", border: "#14B8A6" },
};

// Gold sparks that burst out of the crest on load: [size, x, y, delay, duration]
const PARTICLES: [number, string, string, string, string][] = [
  [5, "-110px", "-90px", "0.65s", "1.1s"],
  [4, "100px", "-115px", "0.7s", "1.0s"],
  [6, "-40px", "-150px", "0.72s", "1.2s"],
  [4, "130px", "-50px", "0.68s", "1.1s"],
  [5, "-140px", "-20px", "0.75s", "1.0s"],
  [3, "60px", "-160px", "0.78s", "1.3s"],
  [4, "-90px", "100px", "0.73s", "0.9s"],
  [3, "95px", "90px", "0.8s", "1.0s"],
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(false);
  const [venmo, setVenmo] = useState({ handle: "@Dillon-Berge", url: "https://venmo.com/Dillon-Berge" });
  const [gameEnabled, setGameEnabled] = useState(false);
  const [jpInfo, setJpInfo] = useState<JpInfo | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const recordRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    fetch("/api/members")
      .then((r) => r.json())
      .then((d: Member[]) => setAllMembers(d ?? []))
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setVenmo({ handle: d.venmo_handle ?? "@Dillon-Berge", url: d.venmo_url ?? "https://venmo.com/Dillon-Berge" });
        setGameEnabled(d.game_enabled === "true");
      })
      .catch(() => {});
    fetch("/api/jp-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JpInfo | null) => setJpInfo(d))
      .catch(() => {});
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    setSelected(null);
    setFines([]);
    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = value.trim().toLowerCase();
    const matches = allMembers.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }

  async function selectMember(member: Member) {
    setQuery(member.name);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelected(member);
    setLoading(true);
    requestAnimationFrame(() => recordRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const res = await fetch(`/api/member-fines/${member.id}`);
    const data = await res.json();
    setFines(data ?? []);
    setLoading(false);
  }

  function clearSelection() {
    setSelected(null);
    setFines([]);
    setQuery("");
    setSuggestions([]);
  }

  const currentFines = fines.filter((f) => ["pending", "upheld"].includes(f.status));
  const pastFines = fines.filter((f) => ["dismissed", "overturned", "paid", "labor", "added_to_dues"].includes(f.status));
  const totalOwed = currentFines
    .filter((f) => f.status === "upheld" && f.amount)
    .reduce((sum, f) => sum + (f.amount ?? 0), 0);

  return (
    <>
      <style>{`

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
        html { scroll-behavior: smooth; }

        body {
          background-color: var(--black);
          font-family: var(--font-sans), sans-serif;
          color: var(--cream);
          min-height: 100vh;
        }

        .page-wrap {
          position: relative;
          min-height: 100vh;
          overflow-x: clip;
          background: var(--black);
          font-family: var(--font-sans), sans-serif;
        }
        .container {
          max-width: 1160px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: var(--gold);
        }
        .serif { font-family: var(--font-serif), serif; }

        /* ── Nav ── */
        .nav {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(10,10,10,0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--black-border);
          animation: fadeDown 0.5s 0.2s ease both;
        }
        .nav-inner {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px 24px;
          padding-top: 14px;
          padding-bottom: 14px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-right: auto;
          color: var(--cream);
          text-decoration: none;
        }
        .brand-name { font-family: var(--font-serif), serif; font-size: 22px; font-weight: 600; }
        .nav-link {
          padding: 12px 4px;
          font-size: 14px;
          color: var(--cream);
          text-decoration: none;
          transition: color 0.2s;
        }
        .nav-link:hover { color: var(--gold-light); }
        .nav-login {
          display: inline-flex;
          align-items: center;
          height: 40px;
          padding: 0 16px;
          border: 1px solid var(--gold-dim);
          border-radius: 8px;
          font-size: 13px;
          color: var(--gold-light);
          text-decoration: none;
          transition: border-color 0.2s, color 0.2s;
        }
        .nav-login:hover { border-color: var(--gold); color: var(--cream); }

        /* ── Hero ── */
        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 48px;
          padding-top: 72px;
          padding-bottom: 56px;
        }
        .hero-text {
          flex: 999 1 520px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .hero-label { letter-spacing: 5px; animation: sliceIn 0.5s 1.1s ease both; }
        .hero-title {
          font-family: var(--font-serif), serif;
          font-size: clamp(44px, 7vw, 72px);
          font-weight: 600;
          line-height: 1;
          color: var(--cream);
          animation: sliceIn 0.5s 1.25s ease both;
        }
        .hero-sub {
          max-width: 520px;
          font-size: 17px;
          line-height: 1.6;
          color: var(--cream-dim);
          animation: fadeUp 0.6s 1.45s ease both;
        }
        .hero-cta {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          height: 52px;
          margin-top: 8px;
          padding: 0 28px;
          background: var(--gold);
          border-radius: 10px;
          color: var(--black);
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          transition: background 0.2s, transform 0.2s;
          animation: fadeUp 0.6s 1.6s ease both;
        }
        .hero-cta:hover { background: var(--gold-light); transform: translateY(-2px); }
        .hero-crest {
          flex: 1 1 280px;
          display: flex;
          justify-content: center;
        }
        .crest-ring {
          position: relative;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          border: 1px solid var(--gold-dim);
          box-shadow: 0 0 0 14px var(--black-card), 0 0 0 15px var(--black-border), 0 0 120px rgba(207,181,59,0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle, #1c1808 0%, var(--black) 70%);
          animation: ringIn 0.8s 0.35s cubic-bezier(0.16,1,0.3,1) both;
        }
        .crest-ring img { animation: crestBurst 1s 0.5s cubic-bezier(0.16,1,0.3,1) both; }

        /* ── Cards ── */
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          padding-bottom: 72px;
          scroll-margin-top: 96px;
        }
        .card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 28px;
          background: var(--black-card);
          border: 1px solid var(--black-border);
          border-radius: 16px;
        }
        .card-search { z-index: 2; animation: fadeUp 0.6s 1.75s ease both; }
        .card-balance {
          background: linear-gradient(135deg, #1f1a06, var(--black-card));
          border-color: var(--gold-dim);
          animation: fadeUp 0.6s 1.87s ease both;
        }
        .card-jp { animation: fadeUp 0.6s 1.99s ease both; }
        .card-title { font-family: var(--font-serif), serif; font-size: 28px; font-weight: 600; color: var(--cream); }
        .card-text { font-size: 15px; line-height: 1.6; color: var(--cream-dim); }
        .card-sub { margin-top: 4px; font-size: 13px; color: var(--cream-dim); }
        .search-label {
          margin-top: auto;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--gold);
        }
        .search-input-wrap { position: relative; }
        .search-input {
          width: 100%;
          height: 52px;
          padding: 0 16px;
          background: var(--black);
          border: 1.5px solid var(--black-border);
          border-radius: 10px;
          font-family: var(--font-sans), sans-serif;
          font-size: 16px;
          color: var(--cream);
          outline: none;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .search-input::placeholder { color: var(--cream-dim); opacity: 0.7; }
        .search-input:hover { border-color: rgba(207,181,59,0.45); }
        .search-input:focus { border-color: var(--gold); box-shadow: 0 0 0 4px rgba(207,181,59,0.12); }
        .suggestions {
          position: absolute;
          top: calc(100% + 6px);
          left: 0; right: 0;
          list-style: none;
          background: var(--black-card);
          border: 1px solid var(--black-border);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 12px 40px rgba(0,0,0,0.6);
          z-index: 50;
        }
        .suggestion-item {
          width: 100%;
          min-height: 44px;
          text-align: left;
          padding: 12px 18px;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(42,42,42,0.6);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s;
        }
        .suggestions li:last-child .suggestion-item { border-bottom: none; }
        .suggestion-item:hover { background: rgba(207,181,59,0.08); }
        .suggestion-name { font-size: 14px; font-weight: 700; color: var(--cream); }
        .suggestion-status { font-size: 11px; color: var(--cream-dim); text-transform: capitalize; letter-spacing: 0.5px; }

        .balance-amount {
          font-family: var(--font-serif), serif;
          font-size: 56px;
          font-weight: 700;
          line-height: 1;
          color: var(--gold-light);
        }
        .balance-amount.muted { color: var(--cream-dim); }
        .pay-buttons {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: auto;
        }
        .pay-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 48px;
          padding: 6px 10px 6px 6px;
          background: var(--black);
          border: 1px solid var(--black-border);
          border-radius: 10px;
          color: var(--cream);
          text-decoration: none;
          transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
        }
        .pay-btn:hover { transform: translateY(-2px); }
        .pay-btn-cashapp:hover { border-color: #00D632; box-shadow: 0 6px 24px rgba(0,214,50,0.15); }
        .pay-btn-venmo:hover   { border-color: #008CFF; box-shadow: 0 6px 24px rgba(0,140,255,0.15); }
        .pay-btn img { border-radius: 8px; display: block; flex-shrink: 0; }
        .pay-btn-text { display: flex; flex-direction: column; min-width: 0; }
        .pay-btn-name { font-size: 14px; font-weight: 700; }
        .pay-btn-handle { font-size: 11px; color: var(--cream-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── JP info card (rotating: wait / next session / common fines) ── */
        .card-jp { min-height: 400px; }
        .jp-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .jp-dots { display: flex; gap: 6px; }
        .jp-dot {
          width: 8px;
          height: 8px;
          padding: 0;
          border: 0;
          border-radius: 4px;
          background: #3a3a3a;
          cursor: pointer;
          transition: width 0.2s ease, background 0.2s;
        }
        .jp-dot:hover { background: var(--gold-dim); }
        .jp-dot.active { width: 28px; background: var(--gold); }
        .jp-arrows { display: flex; gap: 6px; }
        .jp-arrow {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--black-border);
          background: none;
          color: var(--cream-dim);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .jp-arrow:hover { border-color: var(--gold); color: var(--gold-light); }
        .jp-dot:focus-visible, .jp-arrow:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
        /* Panels slide like a carousel: the old one pushes out left as the new one comes in
           from the right (reversed for "previous"). The viewport reaches the card's edges
           so panels travel all the way to the border instead of vanishing mid-card. */
        .card-jp { --jp-pad: 28px; }
        .jp-viewport {
          position: relative;
          flex: 1;
          display: flex;
          overflow: hidden;
          margin: 0 calc(-1 * var(--jp-pad));
          padding: 0 var(--jp-pad);
        }
        .jp-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
        .jp-out { position: absolute; top: 0; bottom: 0; left: var(--jp-pad); right: var(--jp-pad); pointer-events: none; }
        .jp-in.jp-next  { animation: jpInFromRight 0.5s cubic-bezier(0.65, 0, 0.35, 1) both; }
        .jp-out.jp-next { animation: jpOutToLeft   0.5s cubic-bezier(0.65, 0, 0.35, 1) both; }
        .jp-in.jp-prev  { animation: jpInFromLeft  0.5s cubic-bezier(0.65, 0, 0.35, 1) both; }
        .jp-out.jp-prev { animation: jpOutToRight  0.5s cubic-bezier(0.65, 0, 0.35, 1) both; }
        @keyframes jpInFromRight { from { transform: translateX(calc(100% + 2 * var(--jp-pad))); } to { transform: none; } }
        @keyframes jpOutToLeft   { from { transform: none; opacity: 1; } to { transform: translateX(calc(-100% - 2 * var(--jp-pad))); opacity: 0.3; } }
        @keyframes jpInFromLeft  { from { transform: translateX(calc(-100% - 2 * var(--jp-pad))); } to { transform: none; } }
        @keyframes jpOutToRight  { from { transform: none; opacity: 1; } to { transform: translateX(calc(100% + 2 * var(--jp-pad))); opacity: 0.3; } }
        .jp-panel .card-text strong { color: var(--cream); }
        .jp-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
        .jp-big {
          margin-top: auto;
          font-family: var(--font-serif), serif;
          font-size: 52px;
          font-weight: 700;
          line-height: 1;
          color: var(--gold-light);
          font-variant-numeric: lining-nums;
        }
        .jp-bottom .jp-big { margin-top: 0; }
        .jp-big.plain { color: var(--cream); }
        .jp-big.muted { color: var(--cream-dim); }
        .jp-sub { font-size: 14px; line-height: 1.5; color: var(--cream-dim); }
        .jp-weekday { font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--gold); }
        .jp-queue { display: flex; gap: 3px; }
        .jp-queue span { flex-basis: 0; height: 6px; border-radius: 3px; background: var(--black-border); }
        .jp-queue span.ahead { background: var(--gold-dim); }
        .jp-queue span.you { background: var(--gold-light); }
        .jp-common { list-style: none; display: flex; flex-direction: column; }
        .jp-common li {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: baseline;
          padding: 9px 0;
          border-bottom: 1px solid #222;
        }
        .jp-common li:last-child { border-bottom: 0; }
        .jp-rank { font-family: var(--font-serif), serif; font-size: 20px; font-weight: 700; color: var(--gold); }
        .jp-common-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .jp-common-name { font-size: 15px; font-weight: 700; color: var(--cream); }
        .jp-common-meta { font-size: 12px; color: var(--cream-dim); }
        .jp-common-amount { font-size: 15px; font-weight: 700; color: var(--gold-light); white-space: nowrap; }

        /* Take a ticket */
        .jp-ticket { padding-top: 14px; border-top: 1px solid var(--black-border); }
        .jp-ticket-line { font-size: 14px; line-height: 1.5; color: var(--cream-dim); }
        .jp-ticket-line strong { color: var(--gold-light); font-variant-numeric: tabular-nums; }
        .jp-ticket-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          padding: 0 20px;
          border: 0;
          border-radius: 10px;
          background: var(--gold);
          color: var(--black);
          font-family: var(--font-sans), sans-serif;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s;
        }
        .jp-ticket-btn:hover { background: var(--gold-light); color: var(--black); }
        .jp-ticket-btn:disabled { opacity: 0.6; cursor: wait; }
        .jp-ticket-btn:focus-visible { outline: 2px solid var(--gold-light); outline-offset: 2px; }
        .jp-ticket-form { display: flex; flex-direction: column; gap: 8px; }
        .jp-contact { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .jp-contact-opt {
          min-height: 44px;
          border-radius: 10px;
          border: 1.5px solid var(--black-border);
          background: var(--black);
          color: var(--cream);
          font-family: var(--font-sans), sans-serif;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .jp-contact-opt:hover { border-color: rgba(207,181,59,0.45); }
        .jp-contact-opt.on { border-color: var(--gold); background: rgba(207,181,59,0.12); color: var(--gold-light); }
        .jp-contact-opt:focus-visible { outline: 2px solid var(--gold-light); outline-offset: 2px; }
        .jp-ticket-check { display: flex; align-items: center; gap: 10px; min-height: 36px; font-size: 14px; color: var(--cream); cursor: pointer; }
        .jp-ticket-check input { width: 18px; height: 18px; accent-color: var(--gold); }
        .jp-ticket-label { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--gold); }
        .jp-ticket-row { display: flex; gap: 8px; }
        .jp-ticket-input { height: 46px; flex: 1; min-width: 0; }
        .jp-ticket-form > .jp-ticket-input { flex: none; }
        .jp-ticket-error { font-size: 13px; color: #F08A7A; }
        .jp-ticket-fine { font-size: 12px; line-height: 1.5; color: var(--cream-dim); }

        /* ── Member record ── */
        .record {
          max-width: 760px;
          margin: 0 auto;
          padding: 0 24px 72px;
          scroll-margin-top: 96px;
        }
        .member-header {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 16px;
          margin-bottom: 28px;
          border-bottom: 1px solid var(--black-border);
          animation: fadeUp 0.4s ease both;
        }
        .member-name { font-family: var(--font-serif), serif; font-size: 34px; font-weight: 600; color: var(--cream); line-height: 1.1; }
        .member-status { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); margin-top: 4px; }
        .back-btn {
          height: 44px;
          padding: 0 18px;
          background: transparent;
          border: 1px solid var(--black-border);
          border-radius: 8px;
          font-family: var(--font-sans), sans-serif;
          font-size: 13px;
          color: var(--cream);
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .back-btn:hover { border-color: var(--gold); color: var(--gold); }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--cream-dim);
          margin-bottom: 14px;
        }
        .fine-list { margin-bottom: 36px; }
        .fine-card {
          background: var(--black-card);
          border: 1px solid var(--black-border);
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 10px;
          transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
          animation: fadeUp 0.35s ease both;
        }
        .fine-card:hover {
          border-color: rgba(207,181,59,0.45);
          box-shadow: 0 0 0 4px rgba(207,181,59,0.07), 0 12px 40px rgba(0,0,0,0.5);
          transform: scale(1.02);
          position: relative;
          z-index: 1;
        }
        .fine-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .fine-type { font-family: var(--font-serif), serif; font-size: 20px; font-weight: 600; color: var(--cream); line-height: 1.2; }
        .fine-desc { font-size: 13px; color: var(--cream-dim); margin-top: 4px; line-height: 1.4; }
        .fine-notes { font-size: 12px; color: var(--cream-dim); margin-top: 5px; font-style: italic; }
        .fine-right { text-align: right; flex-shrink: 0; }
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
        .fine-amount { font-family: var(--font-serif), serif; font-size: 22px; font-weight: 700; color: var(--cream); margin-top: 6px; }
        .fine-meta { font-size: 11px; color: var(--cream-dim); letter-spacing: 0.3px; }
        .bylaw-link { font-size: 11px; color: var(--gold); text-decoration: none; letter-spacing: 0.5px; white-space: nowrap; transition: color 0.2s; }
        .bylaw-link:hover { color: var(--gold-light); }
        .empty-text {
          text-align: center;
          color: var(--cream-dim);
          padding: 48px 0;
          font-style: italic;
          font-family: var(--font-serif), serif;
          font-size: 18px;
        }

        /* ── How JP works ── */
        .how {
          background: var(--black-card);
          border-top: 1px solid var(--black-border);
          border-bottom: 1px solid var(--black-border);
          animation: fadeUp 0.7s 2.2s ease both;
        }
        .how-inner { display: flex; flex-direction: column; gap: 36px; padding-top: 64px; padding-bottom: 64px; }
        .how-title { font-family: var(--font-serif), serif; font-size: 40px; font-weight: 600; color: var(--cream); margin-top: 10px; }
        .steps {
          list-style: none;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 24px;
        }
        .step { display: flex; flex-direction: column; gap: 10px; padding-top: 18px; border-top: 2px solid var(--gold-dim); }
        .step-num { font-family: var(--font-serif), serif; font-size: 36px; font-weight: 700; color: var(--gold); line-height: 1; }
        .step-name { font-size: 16px; font-weight: 700; }
        .step-text { font-size: 14px; line-height: 1.6; color: var(--cream-dim); }
        .step-text strong { color: var(--cream); }

        .footer {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 12px;
          padding-top: 32px;
          padding-bottom: 32px;
          font-size: 13px;
          color: var(--cream-dim);
          animation: fadeUp 0.7s 2.2s ease both;
        }

        @media (max-width: 640px) {
          .hero { padding-top: 40px; gap: 40px; }
          .crest-ring { width: 240px; height: 240px; }
          .crest-ring img { width: 128px; height: 170px; }
          .card { padding: 22px; }
          .card-jp { --jp-pad: 22px; }
          .balance-amount, .jp-big { font-size: 46px; }
          /* Keep the sticky bar to one row on phones; the hero button and cards cover lookup/pay */
          .nav-inner { gap: 8px 16px; padding-top: 10px; padding-bottom: 10px; }
          .nav-link-wide { display: none; }
          .cards, .record { scroll-margin-top: 76px; }
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
          45%  { clip-path: inset(0% 0 0% 0); filter: brightness(1); }
          100% { opacity: 1; clip-path: inset(0% 0 0% 0); filter: brightness(1); }
        }
        @keyframes ringIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* ── Entrance: particles ── */
        @keyframes particleFly {
          0%   { opacity: 0; transform: translate(0,0) scale(0); }
          25%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.15); }
        }
        .particle {
          position: absolute;
          top: 50%;
          left: 50%;
          border-radius: 50%;
          background: var(--gold);
          pointer-events: none;
          animation: particleFly var(--dur, 1s) var(--delay, 0s) ease-out both;
        }

        /* ── Entrance: header text ── */
        @keyframes sliceIn {
          from { opacity: 0; clip-path: inset(50% 0 50% 0); }
          to   { opacity: 1; clip-path: inset(0% 0 0% 0); }
        }

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
          font-family: var(--font-serif), serif;
          font-style: italic;
          font-size: 17px;
          color: var(--cream-dim);
          animation: loadFadeIn 0.35s 0.1s ease both;
        }

        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .scan-line, .particle { display: none; }
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-delay: 0s !important; }
        }
      `}</style>

      <div className={`page-wrap ${serif.variable} ${sans.variable}`}>
        <div className="scan-line" aria-hidden="true" />

        {/* ── Nav ── */}
        <nav className="nav">
          <div className="container nav-inner">
            <a href="#" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/crest.webp" alt="" width={30} height={40} style={{ objectFit: "contain" }} />
              <span className="brand-name">Acacia JP</span>
            </a>
            <a href="#lookup" className="nav-link nav-link-wide">Fine lookup</a>
            <a href="#lookup" className="nav-link nav-link-wide">Pay</a>
            {gameEnabled && <a href="/game" className="nav-link">Game</a>}
            <a href="/admin/login" className="nav-login">Officer login</a>
          </div>
        </nav>

        {/* ── Hero ── */}
        <header className="container hero">
          <div className="hero-text">
            <p className="eyebrow hero-label">Acacia Fraternity · Oregon State Chapter</p>
            <h1 className="hero-title">Know where you stand.</h1>
            <p className="hero-sub">Look up your fines, see what&rsquo;s still under review, and pay your balance, all in one place.</p>
            <a href="#lookup" className="hero-cta">Look up my fines ↓</a>
          </div>
          <div className="hero-crest">
            <div className="crest-ring">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/crest.webp" alt="Acacia Fraternity Crest" width={160} height={213} style={{ objectFit: "contain" }} />
              {PARTICLES.map(([size, tx, ty, delay, dur], i) => (
                <span
                  key={i}
                  className="particle"
                  aria-hidden="true"
                  style={{ width: size, height: size, "--tx": tx, "--ty": ty, "--delay": delay, "--dur": dur } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
        </header>

        {/* ── Lookup / balance / JP info ── */}
        <section id="lookup" className="container cards">
          <article className="card card-search" ref={wrapperRef}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CFB53B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <h2 className="card-title">Your fines</h2>
            <p className="card-text">Every fine on your record, current and past, with its status and amount.</p>
            <label htmlFor="member-search" className="search-label">Your name</label>
            <div className="search-input-wrap">
              <input
                id="member-search"
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
                      <button onMouseDown={() => selectMember(m)} className="suggestion-item">
                        <span className="suggestion-name">{m.name}</span>
                        <span className="suggestion-status">{m.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>

          <article className="card card-balance">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#CFB53B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></svg>
            <div>
              <h2 className="card-title">Balance due</h2>
              <p className="card-sub">
                {!selected ? "Search your name to see your balance" : loading ? "Retrieving records…" : `for ${selected.name}`}
              </p>
            </div>
            {selected && !loading ? (
              <p className="balance-amount">${totalOwed.toFixed(2)}</p>
            ) : (
              <p className="balance-amount muted" aria-hidden="true">$—</p>
            )}
            {selected && !loading && totalOwed === 0 && <p className="card-text">You&rsquo;re all paid up.</p>}
            <div className="pay-buttons">
              <a href="https://cash.app/$AcaciaOSU" target="_blank" rel="noopener noreferrer" className="pay-btn pay-btn-cashapp">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cashapp-logo.png" alt="" width={34} height={34} />
                <span className="pay-btn-text">
                  <span className="pay-btn-name">Cash App</span>
                  <span className="pay-btn-handle">$AcaciaOSU</span>
                </span>
              </a>
              <a href={venmo.url} target="_blank" rel="noopener noreferrer" className="pay-btn pay-btn-venmo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/venmo-logo.png" alt="" width={34} height={34} />
                <span className="pay-btn-text">
                  <span className="pay-btn-name">Venmo</span>
                  <span className="pay-btn-handle">{venmo.handle}</span>
                </span>
              </a>
            </div>
          </article>

          <JpInfoCard info={jpInfo} member={selected} />
        </section>

        {/* ── Member record ── */}
        {selected && (
          <section className="record" ref={recordRef}>
            <div className="member-header">
              <div>
                <h2 className="member-name">
                  {selected.name}{selected.roll ? ` - ${selected.roll}` : ""}
                </h2>
                <p className="member-status">{selected.status}</p>
              </div>
              <button className="back-btn" onClick={clearSelection}>← New search</button>
            </div>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "52px 0 56px" }}>
                <div className="loading-bar-wrap"><div className="loading-bar" /></div>
                <p className="loading-bar-text">Retrieving records…</p>
              </div>
            ) : (
              <>
                <FineSection title="Current Fines" fines={currentFines} />
                <FineSection title="Past Fines" fines={pastFines} />
                {fines.length === 0 && <p className="empty-text">No fines on record.</p>}
              </>
            )}
          </section>
        )}

        {/* ── How JP works ── */}
        <section className="how">
          <div className="container how-inner">
            <div>
              <p className="eyebrow">How JP works</p>
              <h2 className="how-title">From fine to resolved</h2>
            </div>
            <ol className="steps">
              <li className="step">
                <span className="step-num">I</span>
                <span className="step-name">Fine issued</span>
                <span className="step-text">It shows up here as <strong>Pending</strong>.</span>
              </li>
              <li className="step">
                <span className="step-num">II</span>
                <span className="step-name">Reviewed at JP</span>
                <span className="step-text">
                  The board hears it at the next session{jpInfo?.nextSession ? <>, <strong>{new Date(jpInfo.nextSession.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</strong></> : ""}.
                </span>
              </li>
              <li className="step">
                <span className="step-num">III</span>
                <span className="step-name">Decision</span>
                <span className="step-text"><strong>Upheld</strong>, <strong>dismissed</strong> or <strong>overturned</strong>.</span>
              </li>
              <li className="step">
                <span className="step-num">IV</span>
                <span className="step-name">Resolve it</span>
                <span className="step-text">Pay, work it off as labor, or add it to dues.</span>
              </li>
            </ol>
          </div>
        </section>

        <footer className="container footer">
          <span>Acacia Fraternity · Oregon State Chapter</span>
          <span>Questions? Contact the JP Chair.</span>
        </footer>
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
                {fine.fining_officer && (
                  <p className="fine-notes">Fining Officer: {fine.fining_officer}</p>
                )}
              </div>
              <div className="fine-right">
                <span
                  className="status-badge"
                  style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
                >
                  {fine.status.replace(/_/g, " ")}
                </span>
                {fine.amount != null && (
                  <p className="fine-amount">${fine.amount.toFixed(2)}</p>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
              <p className="fine-meta">
                Issued {new Date(fine.date_issued + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                &nbsp;·&nbsp;{fine.term}
              </p>
              <a
                href="https://docs.google.com/document/d/13aVuc4zSPj-XxPeFLaBUZ_Cns-eJGTo8/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="bylaw-link"
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
