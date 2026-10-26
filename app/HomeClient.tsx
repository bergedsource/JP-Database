"use client";

import { useState, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { Figtree } from "next/font/google";
import type { Fine, Member } from "@/lib/types";
import type { JpInfo } from "@/lib/jp-info";
import type { PublicMember, PublicSettings } from "@/lib/public-data";
import { CommonFinesCard, NextJpCard, WaitCard } from "./JpInfoCard";

// Self-hosted by next/font so the CSP's font-src 'self' allows it.
const sans = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans" });

// Oregon State brand palette only (no tints/shades): Beaver Orange, black, white,
// plus the light secondaries used sparingly for status chips.
const STATUS_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  pending:       { bg: "#FDD26E", color: "#000000", border: "#FDD26E" }, // Candela
  upheld:        { bg: "#D73F09", color: "#FFFFFF", border: "#D73F09" }, // Beaver Orange
  dismissed:     { bg: "#C4D6A4", color: "#000000", border: "#C4D6A4" }, // Reindeer Moss
  overturned:    { bg: "#C4D6A4", color: "#000000", border: "#C4D6A4" },
  paid:          { bg: "#C6DAE7", color: "#000000", border: "#C6DAE7" }, // Moondust
  labor:         { bg: "#B8DDE1", color: "#000000", border: "#B8DDE1" }, // Seafoam
  added_to_dues: { bg: "#FFFFFF", color: "#000000", border: "#000000" },
};

const BYLAWS_URL = "https://docs.google.com/document/d/13aVuc4zSPj-XxPeFLaBUZ_Cns-eJGTo8/edit";

// The homepage. app/page.tsx renders it on the server with the public data already
// loaded, so the cards paint filled in; it then refreshes the JP info in the browser.
export default function HomeClient({
  initialInfo,
  initialSettings,
  initialMembers,
}: {
  initialInfo: JpInfo | null;
  initialSettings: PublicSettings | null;
  initialMembers: PublicMember[] | null;
}) {
  const [query, setQuery] = useState("");
  const [allMembers, setAllMembers] = useState<Member[]>((initialMembers ?? []) as Member[]);
  const [suggestions, setSuggestions] = useState<Member[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [venmo, setVenmo] = useState({
    handle: initialSettings?.venmo_handle ?? "@Dillon-Berge",
    url: initialSettings?.venmo_url ?? "https://venmo.com/Dillon-Berge",
  });
  const [gameEnabled, setGameEnabled] = useState(initialSettings?.game_enabled === "true");
  const [jpInfo, setJpInfo] = useState<JpInfo | null>(initialInfo);
  // Fines requested on the first touch of a name, before the tap even finishes.
  const prefetch = useRef<{ id: string; req: Promise<Fine[]> } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const recordRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    // Only fetched here if the server couldn't include them.
    if (!initialMembers) {
      fetch("/api/members")
        .then((r) => r.json())
        .then((d: Member[]) => setAllMembers(d ?? []))
        .catch(() => {});
    }
    if (!initialSettings) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => {
          setVenmo({ handle: d.venmo_handle ?? "@Dillon-Berge", url: d.venmo_url ?? "https://venmo.com/Dillon-Berge" });
          setGameEnabled(d.game_enabled === "true");
        })
        .catch(() => {});
    }
    // The server copy can be up to 30 s old; refresh it (who's up, ticket window).
    fetch("/api/jp-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JpInfo | null) => setJpInfo(d))
      .catch(() => {});
    return () => document.removeEventListener("mousedown", handleClick);
  }, [initialMembers, initialSettings]);

  function finesFor(id: string): Promise<Fine[]> {
    if (prefetch.current?.id === id) return prefetch.current.req;
    const req = fetch(`/api/member-fines/${id}`).then((r) => r.json()).then((d) => d ?? []).catch(() => []);
    prefetch.current = { id, req };
    return req;
  }

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
    withTransition(() => {
      setQuery(member.name);
      setShowSuggestions(false);
      setSuggestions([]);
      setSelected(member);
      setShowPast(false);
      setLoading(true);
    });
    requestAnimationFrame(() => recordRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const data = await finesFor(member.id);
    prefetch.current = null;
    withTransition(() => {
      setFines(data);
      setLoading(false);
    });
  }

  function clearSelection() {
    withTransition(() => {
      setSelected(null);
      setFines([]);
      setQuery("");
      setSuggestions([]);
    });
  }

  const currentFines = fines.filter((f) => ["pending", "upheld"].includes(f.status));
  const pastFines = fines.filter((f) => ["dismissed", "overturned", "paid", "labor", "added_to_dues"].includes(f.status));
  const totalOwed = currentFines
    .filter((f) => f.status === "upheld" && f.amount)
    .reduce((sum, f) => sum + (f.amount ?? 0), 0);
  const pendingFines = currentFines.filter((f) => f.status === "pending");
  const pendingTotal = pendingFines.reduce((sum, f) => sum + (f.amount ?? 0), 0);
  const nextDay = jpInfo?.nextSession
    ? new Date(jpInfo.nextSession.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })
    : "";

  // One plain sentence that answers "where do I stand?" before any detail.
  const summary = !selected || loading ? "" : [
    totalOwed > 0 ? `You owe $${money(totalOwed)} now.` : "You don’t owe anything right now.",
    pendingFines.length > 0
      ? `${pendingFines.length === 1 ? "One fine" : `${pendingFines.length} fines`}${pendingTotal > 0 ? ` ($${money(pendingTotal)})` : ""} ${pendingFines.length === 1 ? "goes" : "go"} to JP${nextDay ? ` on ${nextDay}` : ""}. Come to speak to ${pendingFines.length === 1 ? "it" : "them"}; if you miss your turn, ${pendingFines.length === 1 ? "it’s" : "they’re"} upheld.`
      : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <style>{`
        :root {
          --orange: #D73F09;
          --black: #000000;
          --white: #FFFFFF;
          --moondust: #C6DAE7;
          --ease: cubic-bezier(0.2, 0, 0, 1);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: var(--white); color: var(--black); font-family: var(--font-sans), system-ui, sans-serif; min-height: 100vh; }
        a { color: var(--black); }
        a:hover { color: var(--orange); }
        .num { font-variant-numeric: tabular-nums; }

        .page-wrap { min-height: 100vh; overflow-x: clip; background: var(--white); font-family: var(--font-sans), system-ui, sans-serif; }
        .stripe { height: 6px; background: var(--orange); }
        .container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }

        /* Nav */
        .nav-inner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-top: 16px; padding-bottom: 16px; }
        .brand { display: flex; align-items: center; gap: 10px; margin-right: auto; text-decoration: none; }
        .brand-name { font-size: 19px; font-weight: 700; }
        .nav-link { display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 999px; font-weight: 600; text-decoration: none; }
        .nav-login { display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--black); color: var(--white); font-weight: 600; text-decoration: none; }
        .nav-login:hover { background: var(--orange); color: var(--white); }

        /* Hero + search */
        .hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px; padding-top: 24px; padding-bottom: 28px; }
        .hero-title { font-size: clamp(40px, 7vw, 60px); font-weight: 800; line-height: 1.02; letter-spacing: -0.035em; }
        .hero-sub { max-width: 560px; font-size: 19px; line-height: 1.5; }
        .search-wrap { position: relative; width: 100%; max-width: 600px; z-index: 5; }
        .search-pill { display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 24px; background: var(--white); border: 2px solid var(--black); border-radius: 999px; }
        .search-pill:focus-within { border-color: var(--orange); }
        .search-pill input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font: inherit; font-size: 18px; color: var(--black); }
        .search-pill input::placeholder { color: var(--black); opacity: 0.55; }
        .search-go { flex: none; width: 48px; height: 48px; border-radius: 50%; background: var(--orange); display: flex; align-items: center; justify-content: center; }
        .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .suggestions { position: absolute; top: calc(100% + 8px); left: 0; right: 0; list-style: none; background: var(--white); border: 2px solid var(--black); border-radius: 22px; overflow: hidden; text-align: left; }
        .suggestion-item { width: 100%; min-height: 48px; padding: 12px 22px; background: var(--white); border: none; border-bottom: 1px solid var(--moondust); display: flex; justify-content: space-between; align-items: center; gap: 12px; font: inherit; color: var(--black); cursor: pointer; }
        .suggestions li:last-child .suggestion-item { border-bottom: none; }
        .suggestion-item:hover, .suggestion-item:focus-visible { background: var(--moondust); outline: none; }
        .suggestion-name { font-size: 16px; font-weight: 600; }
        .suggestion-status { font-size: 14px; text-transform: capitalize; }

        /* Cards */
        .row { display: flex; flex-wrap: wrap; gap: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .stack { display: flex; flex-direction: column; gap: 20px; padding-bottom: 48px; scroll-margin-top: 16px; }
        .card { position: relative; display: flex; flex-direction: column; gap: 14px; padding: 24px; background: var(--white); border: 1px solid var(--moondust); border-radius: 22px; min-width: 0; }
        .card-record { flex: 2 1 560px; }
        .card-dark { flex: 1 1 300px; background: var(--black); color: var(--white); border-color: var(--black); overflow: hidden; }
        .card-watermark { position: absolute; right: -40px; bottom: -30px; width: 220px; height: 220px; object-fit: contain; opacity: 0.12; pointer-events: none; }
        .card-dark > *:not(.card-watermark) { position: relative; }
        .card-kicker { font-weight: 700; color: var(--orange); }
        .card-kicker-muted { font-weight: 600; }
        .card-text { font-size: 15px; line-height: 1.55; }
        .card-sub { font-size: 14px; }
        .card-note { font-size: 15px; line-height: 1.5; padding: 12px 14px; border-radius: 14px; background: var(--moondust); }
        .big-figure { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; }

        /* Record */
        .member-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
        .roll-badge { width: 52px; height: 52px; border-radius: 50%; background: var(--orange); color: var(--white); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; flex: none; }
        .member-name { font-size: 22px; font-weight: 700; line-height: 1.2; }
        .member-meta { text-transform: capitalize; }
        .back-btn { margin-left: auto; min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--black); background: var(--white); font: inherit; font-weight: 600; color: var(--black); cursor: pointer; }
        .back-btn:hover { border-color: var(--orange); color: var(--orange); }
        .summary { font-size: 20px; line-height: 1.45; max-width: 600px; }
        .balance-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .balance-amount { font-size: 60px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
        .pending-line { margin-top: 6px; font-size: 15px; font-variant-numeric: tabular-nums; }
        .pay-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
        .pay-btn { display: inline-flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 18px 6px 6px; border-radius: 999px; text-decoration: none; font-weight: 700; }
        .pay-btn img { border-radius: 50%; display: block; flex-shrink: 0; }
        .pay-btn-text { display: flex; flex-direction: column; line-height: 1.2; }
        .pay-btn-handle { font-size: 12px; font-weight: 500; }
        .pay-venmo { background: var(--orange); color: var(--white); }
        .pay-venmo:hover { background: var(--black); color: var(--white); }
        .pay-cashapp { background: var(--moondust); color: var(--black); }
        .pay-cashapp:hover { background: var(--black); color: var(--white); }

        .fine-list { display: flex; flex-direction: column; }
        .fine-row { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 14px 0; border-top: 1px solid var(--moondust); }
        .fine-type { font-weight: 600; }
        .fine-meta { margin-top: 2px; font-size: 14px; line-height: 1.45; }
        .fine-meta a { font-weight: 600; }
        .fine-right { display: flex; align-items: center; gap: 12px; flex: none; }
        .status-badge { display: inline-block; font-size: 13px; font-weight: 600; padding: 3px 10px; border-radius: 999px; border: 1px solid; text-transform: capitalize; white-space: nowrap; }
        .fine-amount { width: 72px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
        .fine-amount.void { font-weight: 500; text-decoration: line-through; }
        .past-toggle { display: flex; justify-content: space-between; align-items: center; min-height: 48px; padding: 0; border: none; border-top: 1px solid var(--moondust); background: transparent; font: inherit; font-weight: 600; color: var(--black); cursor: pointer; }
        .past-toggle svg { transition: transform 0.2s; }
        .past-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
        .empty-text { padding: 12px 0; }

        /* Loading */
        .loading-bar-wrap { width: 220px; height: 4px; background: var(--moondust); border-radius: 2px; position: relative; overflow: hidden; }
        .loading-bar { position: absolute; top: 0; height: 100%; width: 40%; background: var(--orange); animation: barSweep 1.2s ease-in-out infinite; }
        @keyframes barSweep { from { left: -40%; } to { left: 100%; } }

        /* Next JP (dark card) */
        .jp-date { font-size: 34px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; font-variant-numeric: tabular-nums; }
        .jp-place { line-height: 1.5; }
        .jp-line { border-top: 1px solid var(--white); padding-top: 14px; display: flex; flex-direction: column; gap: 2px; }
        .jp-line-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
        .jp-line-title { font-weight: 700; }
        .jp-line-count, .jp-line-more { font-size: 14px; font-variant-numeric: tabular-nums; }
        .jp-line-group { margin-bottom: 4px; font-size: 13px; font-weight: 700; color: var(--orange); }
        .jp-line-list { list-style: none; display: flex; flex-direction: column; gap: 2px; }
        .jp-line-panel { animation: lineIn 0.35s ease both; }
        @keyframes lineIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
        .jp-line-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .jp-line-tab { min-height: 44px; padding: 0 12px; border: 1px solid var(--white); border-radius: 999px; background: var(--black); color: var(--white); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
        .jp-line-tab.on { background: var(--white); color: var(--black); }
        .jp-line-tab:focus-visible { outline: 2px solid var(--orange); outline-offset: 2px; }
        .jp-line-row { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 10px; margin: 0 -10px; border-radius: 10px; }
        .jp-line-row.first { background: var(--orange); }
        .jp-line-roll { flex: none; min-width: 3.4em; font-weight: 800; font-variant-numeric: tabular-nums; }
        .jp-line-name { flex: 1; min-width: 0; }
        .jp-line-tag { font-size: 14px; font-weight: 600; }
        .jp-line-more { margin-top: 6px; }
        .jp-window { margin-top: auto; background: var(--orange); border-radius: 16px; padding: 14px 16px; }
        .jp-window .jp-ticket-line { color: var(--white); }
        .jp-window .jp-ticket-line strong { color: var(--white); }

        /* Wait */
        .jp-queue { display: flex; gap: 3px; }
        .jp-queue span { flex-basis: 0; height: 8px; border-radius: 4px; background: var(--moondust); }
        .jp-queue span.ahead { background: var(--black); }
        .jp-queue span.you { background: var(--orange); }

        /* Common fines */
        .jp-common { list-style: none; display: flex; flex-direction: column; }
        .jp-common li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--moondust); }
        .jp-common li:first-child { border-top: 0; }
        .jp-common-text { display: flex; flex-direction: column; min-width: 0; }
        .jp-common-name { font-weight: 600; }
        .jp-common-meta { font-size: 14px; }
        .jp-common-count { font-weight: 700; font-variant-numeric: tabular-nums; }

        /* Take a ticket */
        .jp-ticket { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--moondust); }
        .jp-ticket-line { font-size: 15px; line-height: 1.5; }
        .jp-ticket-line strong { color: var(--orange); font-variant-numeric: tabular-nums; }
        .jp-ticket-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 24px; border: 0; border-radius: 999px; background: var(--orange); color: var(--white); font: inherit; font-size: 17px; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; }
        .jp-ticket-btn:hover { background: var(--black); color: var(--white); }
        .jp-ticket-btn:disabled { opacity: 0.6; cursor: wait; }
        .jp-ticket-btn:focus-visible, .jp-contact-opt:focus-visible { outline: 3px solid var(--black); outline-offset: 2px; }
        .jp-ticket-form { display: flex; flex-direction: column; gap: 10px; }
        .jp-contact { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 14px; background: var(--moondust); }
        .jp-contact-opt { min-height: 42px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--black); font: inherit; font-weight: 600; cursor: pointer; }
        .jp-contact-opt.on { background: var(--white); border-color: var(--black); }
        .jp-officer-chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
        .jp-officer-chip { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 4px 0 12px; border-radius: 999px; background: var(--black); color: var(--white); font-weight: 600; font-size: 14px; }
        .jp-officer-chip button { width: 40px; height: 40px; border: none; border-radius: 50%; background: transparent; color: var(--white); font: inherit; font-size: 18px; line-height: 1; cursor: pointer; }
        .jp-officer-chip button:hover { background: var(--orange); }
        .jp-ticket-hint { font-weight: 400; font-size: 13px; }
        .jp-ticket-check { display: flex; align-items: center; gap: 10px; min-height: 36px; font-size: 15px; cursor: pointer; }
        .jp-ticket-check input { width: 18px; height: 18px; accent-color: var(--orange); }
        .jp-ticket-label { font-size: 14px; font-weight: 600; }
        .jp-ticket-row { display: flex; gap: 8px; }
        .search-input.jp-ticket-input { height: 48px; flex: 1; min-width: 0; padding: 0 14px; border: 1px solid var(--black); border-radius: 14px; background: var(--white); font: inherit; font-size: 16px; color: var(--black); outline: none; }
        .search-input.jp-ticket-input:focus { border-color: var(--orange); box-shadow: inset 0 0 0 1px var(--orange); }
        .jp-ticket-form > .jp-ticket-input { flex: none; }
        .jp-ticket-select { cursor: pointer; appearance: auto; background: var(--moondust) !important; border-color: var(--moondust) !important; }
        .jp-ticket-links { display: flex; flex-direction: column; gap: 8px; }
        .jp-ticket-error { font-size: 14px; font-weight: 600; color: var(--orange); }
        .jp-ticket-fine { font-size: 13px; line-height: 1.5; }

        /* How JP works */
        .steps { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .step { display: flex; gap: 12px; }
        .step-num { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--orange); color: var(--white); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
        .step-text { line-height: 1.5; }
        .how-title { font-size: 22px; font-weight: 700; }

        .footer { background: var(--black); color: var(--white); }
        .footer a { color: var(--white); }
        .footer-inner { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding-top: 28px; padding-bottom: 28px; }
        .footer-right { margin-left: auto; }

        /* Instant tap feedback (phones never hover) */
        a, button, select, input, label { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .press, .nav-login, .nav-link, .back-btn, .pay-btn, .past-toggle, .jp-ticket-btn, .jp-contact-opt, .jp-line-tab, .suggestion-item, .search-go {
          transition: transform 0.12s var(--ease), background-color 0.12s var(--ease), color 0.12s var(--ease);
        }
        .press:active, .nav-login:active, .nav-link:active, .back-btn:active, .pay-btn:active, .past-toggle:active,
        .jp-ticket-btn:active, .jp-contact-opt:active, .jp-line-tab:active, .search-go:active { transform: scale(0.96); }
        .suggestion-item:active { background: var(--moondust); transform: none; }
        .pay-venmo:active, .jp-ticket-btn:active, .action-pay:active { background: var(--black); color: var(--white); }

        /* Loading placeholders */
        /* Only shown if loading takes over 300 ms, so fast lookups never flash it. */
        .skeleton { display: flex; flex-direction: column; gap: 14px; padding: 4px 0 8px; animation: skShow 0s linear 0.3s both; }
        @keyframes skShow { from { visibility: hidden; } to { visibility: visible; } }
        .sk { display: block; border-radius: 10px; background: var(--moondust); animation: skPulse 1s ease-in-out infinite alternate; }
        .sk-line { height: 22px; }
        .sk-big { height: 60px; width: 45%; }
        .sk-row { height: 48px; }
        @keyframes skPulse { from { opacity: 1; } to { opacity: 0.45; } }

        /* Results slide in */
        .card-record { animation: cardIn 0.25s var(--ease) both; view-transition-name: record; }
        @supports (view-transition-name: none) { .card-record { animation: none; } }
        ::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.2s; animation-timing-function: var(--ease); }
        ::view-transition-group(record) { animation-duration: 0.25s; animation-timing-function: var(--ease); }
        ::view-transition-new(record):only-child { animation: cardIn 0.25s var(--ease) both; }
        .paid-up { display: flex; align-items: center; gap: 12px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
        .paid-check { width: 40px; height: 40px; border-radius: 50%; background: var(--orange); display: flex; align-items: center; justify-content: center; animation: popIn 0.4s var(--ease) both; }
        @keyframes popIn { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
        .jp-ticket-done { font-weight: 700; color: var(--black); padding: 12px 14px; border-radius: 14px; background: var(--moondust); }
        @keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

        /* Phone action bar */
        .action-bar { display: none; }
        @media (max-width: 640px) {
          .action-bar {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
            display: flex; gap: 8px; padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
            background: var(--white); border-top: 1px solid var(--moondust);
          }
          .action-bar a { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 999px; font-weight: 700; font-size: 17px; text-decoration: none; }
          .action-pay { background: var(--orange); color: var(--white); }
          .action-pay:hover { color: var(--white); }
          .action-ticket, .action-ticket:hover { background: var(--black); color: var(--white); }
          .page-wrap:has(.action-bar) .footer { padding-bottom: 76px; }
        }

        @media (max-width: 640px) {
          .hero-sub { font-size: 17px; }
          .card { padding: 20px; }
          .balance-amount { font-size: 48px; }
          .nav-link-wide { display: none; }
          .fine-row { flex-wrap: wrap; row-gap: 8px; }
          .fine-right { width: 100%; justify-content: space-between; }
          .footer-right { margin-left: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <div className={`page-wrap ${sans.variable}`}>
        <div className="stripe" aria-hidden="true" />

        <nav className="container nav-inner" aria-label="Main">
          <a href="#" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/crest.webp" alt="Acacia crest" width={36} height={36} style={{ objectFit: "contain" }} />
            <span className="brand-name">Acacia JP</span>
          </a>
          <a href="#how" className="nav-link nav-link-wide">How JP works</a>
          {gameEnabled && <a href="/game" className="nav-link">Game</a>}
          <a href="/admin/login" className="nav-login">Officer login</a>
        </nav>

        <main className="container">
          <header className="hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/crest.webp" alt="" width={88} height={88} style={{ objectFit: "contain" }} />
            <h1 className="hero-title">Know where you stand.</h1>
            <p className="hero-sub">Your fines, your balance, and your spot in line at JP, all in one place.</p>
            <div className="search-wrap" ref={wrapperRef}>
              <label htmlFor="member-search" className="visually-hidden">Your name</label>
              <div className="search-pill">
                <input
                  id="member-search"
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) selectMember(suggestions[0]); }}
                  placeholder="Search your name"
                  autoComplete="off"
                />
                <span className="search-go" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
                </span>
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions">
                  {suggestions.map((m) => (
                    <li key={m.id}>
                      <button
                        onPointerDown={() => finesFor(m.id)}
                        onClick={() => selectMember(m)}
                        className="suggestion-item press"
                      >
                        <span className="suggestion-name">{m.name}</span>
                        <span className="suggestion-status">{m.roll != null ? `Roll #${m.roll}` : m.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </header>

          <div className="stack" id="lookup">
            <div className="row">
              {selected ? (
                <section className="card card-record" ref={recordRef} aria-label={`${selected.name}'s fines`}>
                  <div className="member-head">
                    {selected.roll != null && <span className="roll-badge num">{selected.roll}</span>}
                    <div>
                      <h2 className="member-name">{selected.name}</h2>
                      <p className="member-meta">{selected.roll != null ? `Roll #${selected.roll}` : selected.status}</p>
                    </div>
                    <button className="back-btn" onClick={clearSelection}>New search</button>
                  </div>

                  {loading ? (
                    <div className="skeleton" role="status" aria-label="Loading fines">
                      <span className="sk sk-line" style={{ width: "80%" }} />
                      <span className="sk sk-big" />
                      <span className="sk sk-row" />
                      <span className="sk sk-row" />
                    </div>
                  ) : (
                    <>
                      <p className="summary">{summary}</p>
                      <div className="balance-row">
                        <div>
                          {totalOwed > 0 ? (
                            <>
                              <p style={{ fontWeight: 500 }}>Owe now</p>
                              <p className="balance-amount"><CountUp value={totalOwed} /></p>
                            </>
                          ) : (
                            <p className="paid-up">
                              <span className="paid-check" aria-hidden="true">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17.5 19 7" /></svg>
                              </span>
                              You&rsquo;re all paid up
                            </p>
                          )}
                          {pendingTotal > 0 && <p className="pending-line">+ ${money(pendingTotal)} pending JP</p>}
                        </div>
                        <div className="pay-buttons">
                          <a href={venmo.url} target="_blank" rel="noopener noreferrer" className="pay-btn pay-venmo">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/venmo-logo.png" alt="" width={36} height={36} />
                            <span className="pay-btn-text">Venmo<span className="pay-btn-handle">{venmo.handle}</span></span>
                          </a>
                          <a href="https://cash.app/$AcaciaOSU" target="_blank" rel="noopener noreferrer" className="pay-btn pay-cashapp">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/cashapp-logo.png" alt="" width={36} height={36} />
                            <span className="pay-btn-text">Cash App<span className="pay-btn-handle">$AcaciaOSU</span></span>
                          </a>
                        </div>
                      </div>

                      <div className="fine-list">
                        {currentFines.map((f) => <FineRow key={f.id} fine={f} />)}
                        {fines.length === 0 && <p className="empty-text">No fines on record.</p>}
                        {pastFines.length > 0 && (
                          <>
                            <button type="button" className="past-toggle" aria-expanded={showPast} onClick={() => withTransition(() => setShowPast((v) => !v))}>
                              {showPast ? "Hide" : "Show"} {pastFines.length} resolved fine{pastFines.length !== 1 ? "s" : ""}
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            {showPast && pastFines.map((f) => <FineRow key={f.id} fine={f} />)}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </section>
              ) : null}
              <NextJpCard info={jpInfo} />
            </div>

            <div className="grid">
              <WaitCard info={jpInfo} member={selected} />
              <CommonFinesCard info={jpInfo} />
            </div>

            <section id="how" className="card" style={{ scrollMarginTop: 16 }}>
              <h2 className="how-title">How JP works</h2>
              <ol className="steps">
                <li className="step"><span className="step-num">1</span><span className="step-text"><strong>Fine issued</strong><br />It shows up here as Pending.</span></li>
                <li className="step">
                  <span className="step-num">2</span>
                  <span className="step-text">
                    <strong>Reviewed at JP</strong><br />
                    Heard at the next session{jpInfo?.nextSession ? <>, {new Date(jpInfo.nextSession.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</> : ""}. Come speak to it. If you miss your turn, it&rsquo;s upheld.
                  </span>
                </li>
                <li className="step"><span className="step-num">3</span><span className="step-text"><strong>Decision</strong><br />Upheld, dismissed or overturned.</span></li>
                <li className="step"><span className="step-num">4</span><span className="step-text"><strong>Resolve it</strong><br />Pay, work it off as labor, or add it to dues.</span></li>
              </ol>
            </section>
          </div>
        </main>

        {/* Phone: the two main actions within thumb reach once a brother has found himself. */}
        {selected && !loading && (totalOwed > 0 || jpInfo?.tickets.state === "open") && (
          <div className="action-bar">
            {totalOwed > 0 && (
              <a href={venmo.url} target="_blank" rel="noopener noreferrer" className="action-pay press">
                Pay ${money(totalOwed)}
              </a>
            )}
            {jpInfo?.tickets.state === "open" && (
              <a href="#wait-card" className="action-ticket press">Take a ticket</a>
            )}
          </div>
        )}

        <footer className="footer">
          <div className="container footer-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/crest.webp" alt="" width={44} height={44} style={{ objectFit: "contain" }} />
            <div>
              <p style={{ fontWeight: 700 }}>Acacia Fraternity</p>
              <p>Oregon State Chapter · Corvallis</p>
            </div>
            <p className="footer-right">Questions? Contact the JP Chair.</p>
          </div>
        </footer>
      </div>
    </>
  );
}

// Runs a state change as a View Transition where supported (smooth cross-fade /
// card morph), otherwise just applies it.
function withTransition(update: () => void) {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!d.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  d.startViewTransition(() => flushSync(update));
}

// The balance counts up to its amount (instant with reduced motion).
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const a = from.current;
    const dur = reduce ? 0 : 600;
    let raf = 0;
    const step = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur);
      setShown(a + (value - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>${money(shown)}</>;
}

function money(n: number): string {
  return n.toFixed(2);
}

function FineRow({ fine }: { fine: Fine }) {
  const cfg = STATUS_CONFIG[fine.status] ?? { bg: "#FFFFFF", color: "#000000", border: "#000000" };
  const resolvedFree = ["dismissed", "overturned"].includes(fine.status);
  const issued = new Date(fine.date_issued + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div className="fine-row">
      <div style={{ minWidth: 0 }}>
        <p className="fine-type">{fine.fine_type}</p>
        {fine.description && <p className="fine-meta">{fine.description}</p>}
        <p className="fine-meta">
          {[fine.fining_officer, issued, fine.term].filter(Boolean).join(" · ")} ·{" "}
          <a href={BYLAWS_URL} target="_blank" rel="noopener noreferrer">Bylaws</a>
        </p>
      </div>
      <div className="fine-right">
        <span className="status-badge" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
          {fine.status.replace(/_/g, " ")}
        </span>
        {fine.amount != null && <span className={`fine-amount${resolvedFree ? " void" : ""}`}>${money(fine.amount)}</span>}
      </div>
    </div>
  );
}
