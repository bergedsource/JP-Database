"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Figtree } from "next/font/google";
import { clockAfter, waitLabel, waitRange, type TicketView } from "@/lib/jp-info";
import ThemeToggle from "@/app/ThemeToggle";
import { haptic } from "@/lib/haptics";

const sans = Figtree({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-sans" });

const POLL_MS = 15000;

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

// Short two-tone chime (no audio file needed) when it's almost his turn.
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch {}
}

export default function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [t, setT] = useState<TicketView | null>(null);
  const [missing, setMissing] = useState(false);
  // Set when a load fails (network, 429, 500): shown instead of an endless skeleton.
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Shown once right after taking the ticket (?new=1): the "you're in" moment.
  const [celebrate, setCelebrate] = useState(false);
  const alerted = useRef(false);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    let res: Response;
    let data: TicketView;
    try {
      res = await fetch(`/api/jp-ticket/${token}`, { cache: "no-store" });
      if (res.status === 404) { setMissing(true); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLoadError(`${d.error ?? "Couldn't load your ticket"} (${res.status}). Retrying…`);
        return;
      }
      data = await res.json();
    } catch {
      setLoadError("Couldn't reach the server. Retrying…");
      return;
    }
    setLoadError("");
    loadedRef.current = true;
    setT(data);
    setLoadedAt(Date.now());
    const upNext = data.status === "called" || (data.sessionLive && data.wait.onDocket && data.wait.place <= 2);
    if (upNext && !alerted.current) {
      alerted.current = true;
      chime();
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [token]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, POLL_MS);
    // Until the first load lands, retry every 3 s instead of waiting a full poll.
    const retry = setInterval(() => { if (!loadedRef.current) load(); }, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(retry); clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    window.history.replaceState(null, "", window.location.pathname);
    navigator.vibrate?.([40, 60, 40]);
    const show = setTimeout(() => setCelebrate(true), 0);
    const hide = setTimeout(() => setCelebrate(false), 3200);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  // "Tap again to cancel" resets if he doesn't follow through.
  useEffect(() => {
    if (!confirmCancel) return;
    const r = setTimeout(() => setConfirmCancel(false), 4000);
    return () => clearTimeout(r);
  }, [confirmCancel]);

  // The button changes right away; the server catches up (undone if it fails).
  async function act(kind: "here" | "cancel") {
    setBusy(true);
    setError("");
    setConfirmCancel(false);
    const before = t;
    setT((x) => x && { ...x, status: kind === "here" ? "here" : "cancelled" });
    haptic(30);
    const res = await fetch(`/api/jp-ticket/${token}${kind === "here" ? "/here" : ""}`, { method: kind === "here" ? "POST" : "DELETE" });
    if (!res.ok) {
      setT(before);
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Something went wrong. Try again.");
    }
    await load();
    setBusy(false);
  }

  // Answer the chair's call so he knows you're coming before he skips anyone.
  async function reply(kind: "on_my_way" | "need_5") {
    haptic(20);
    setBusy(true);
    setError("");
    setT((x) => x && { ...x, reply: kind });
    const res = await fetch(`/api/jp-ticket/${token}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply: kind }) });
    if (!res.ok) {
      setT((x) => x && { ...x, reply: null });
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Couldn't send. Try again.");
    }
    await load();
    setBusy(false);
  }

  const wait = t?.wait;
  const queued = wait && wait.onDocket ? wait : null;
  const range = queued ? waitRange(queued.minutesAhead) : null;
  const closed = t && (t.status === "done" || t.status === "cancelled");
  const called = t?.status === "called";
  const upNext = !closed && (called || (t?.sessionLive && queued && queued.place <= 2));
  const ago = loadedAt && now ? Math.max(0, Math.round((now - loadedAt) / 1000)) : 0;

  return (
    <main className={`tk ${sans.variable}`}>
      <style>{CSS}</style>

      {celebrate && t && (
        <div className="tk-celebrate" role="status" onClick={() => setCelebrate(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/crest.webp" alt="" className="tk-stamp" width={120} height={120} />
          <p className="tk-cel-no">Ticket #{t.ticketNo}</p>
          <p className="tk-cel-title">You&rsquo;re in line.</p>
          <p className="tk-cel-text">Go back to your room. We&rsquo;ll reach {t.proxyName ? `${t.proxyName}` : "you"} when it&rsquo;s your turn.</p>
          <button type="button" className="tk-btn primary tk-cel-btn">See my place in line</button>
        </div>
      )}

      <div className="tk-wrap">
        <div className="tk-top">
          <Link href="/" className="tk-home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/crest.webp" alt="" width={32} height={32} style={{ objectFit: "contain" }} />
            Acacia JP
          </Link>
          <ThemeToggle className="tk-theme" />
        </div>

        {missing ? (
          <section className="tk-card">
            <h1 className="tk-title">Ticket not found</h1>
            <p className="tk-text">This ticket has ended or the link is wrong. Tickets close when the JP session ends. Ask the JP Chair if you think that&rsquo;s a mistake.</p>
          </section>
        ) : !t ? (
          <section className="tk-card" aria-busy="true">
            <span className="tk-sk" style={{ width: "40%" }} />
            <span className="tk-sk tk-sk-big" />
            <span className="tk-sk" style={{ width: "70%" }} />
            {loadError && <p className="tk-error" role="alert">{loadError}</p>}
          </section>
        ) : t.status === "done" ? (
          <section className="tk-card tk-done">
            <span className="tk-check" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12.5 10 17.5 19 7" /></svg>
            </span>
            <h1 className="tk-title">You&rsquo;re done for tonight.</h1>
            <p className="tk-text">Your fines for {t.officer} have been heard. Look yourself up on the homepage to see the decisions.</p>
            <Link href="/" className="tk-btn primary tk-link-btn">See my fines</Link>
          </section>
        ) : (
          <>
            {upNext && (
              <div className="tk-banner" role="status">
                {called ? "You’re being called. Head to JP now." : "You’re up next. Start heading to JP."}
              </div>
            )}
            {called && (
              t.reply ? (
                <p className="tk-replied" role="status">Sent to the JP Chair: <strong>{t.reply === "on_my_way" ? "On my way" : "Need 5 min"}</strong></p>
              ) : (
                <div className="tk-reply">
                  <button type="button" className="tk-btn primary" disabled={busy} onClick={() => reply("on_my_way")}>On my way</button>
                  <button type="button" className="tk-btn" disabled={busy} onClick={() => reply("need_5")}>Need 5 min</button>
                </div>
              )
            )}

            {t.note && !closed && <div className="tk-note" role="status">JP Chair: {t.note}</div>}

            <section className="tk-card">
              <div className="tk-head">
                <div>
                  <p className="tk-kicker">Ticket #{t.ticketNo}</p>
                  <h1 className="tk-title">{t.name}</h1>
                  {t.roll != null && <p className="tk-text">Roll #{t.roll}</p>}
                  {t.officer && <p className="tk-text">For <strong className="tk-officer">{t.officer}</strong>&rsquo;s fines</p>}
                  {t.proxyName && <p className="tk-proxy">Proxy: <strong>{t.proxyName}</strong> will be called</p>}
                </div>
                <span className={`tk-status s-${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </div>

              {closed ? (
                <p className="tk-text">You cancelled this ticket.</p>
              ) : queued ? (
                <>
                  <div>
                    <p className="tk-big">
                      {queued.brothersAhead === 0 ? "You’re next" : `${queued.brothersAhead} brother${queued.brothersAhead === 1 ? "" : "s"} ahead`}
                    </p>
                    <p className="tk-wait">
                      {queued.minutesAhead === 0
                        ? (t.sessionLive ? "Head to JP." : "You’re first when JP starts.")
                        : t.sessionLive
                          ? `${waitLabel(queued.minutesAhead)} from now.`
                          : t.startTime
                            ? `Likely ${clockAfter(t.startTime, range!.lo)}–${clockAfter(t.startTime, range!.hi)}.`
                            : `${waitLabel(queued.minutesAhead)} after JP starts.`}
                    </p>
                  </div>
                  {/* The line ahead of him shrinks as brothers are heard. */}
                  <div className="tk-progress" role="img" aria-label={`${queued.brothersAhead} ahead of you, ${ordinal(queued.place)} in line`}>
                    {queued.queue.map((m, i) => (
                      <span key={i} style={{ flexGrow: m }} className={i < queued.queueIndex ? "ahead" : i === queued.queueIndex ? "you" : ""} />
                    ))}
                  </div>
                  <p className="tk-now">
                    {t.nowHearing
                      ? <>Now hearing <strong>{t.nowHearing.roll != null ? `#${t.nowHearing.roll}` : "a brother"}</strong> · {t.nowHearing.officer}</>
                      : t.sessionLive ? "JP is in session" : "JP hasn’t started yet"}
                    {loadedAt > 0 && ` · updated ${ago < 5 ? "just now" : `${ago} sec ago`}`}
                  </p>
                  <ul className="tk-groups">
                    {queued.groups.map((g) => (
                      <li key={g.officer}><strong>{g.officer}</strong>&rsquo;s group: {ordinal(g.place)} of {g.size}</li>
                    ))}
                  </ul>
                  <p className="tk-stakes">Miss your turn and your {t.officer ? `${t.officer} ` : ""}fine is upheld on {new Date(`${t.upholdOn}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}.</p>
                  <p className="tk-fine">This page updates on its own. Keep it open and your volume up; it chimes when you&rsquo;re almost up.</p>
                </>
              ) : null}

              {error && <p className="tk-error" role="alert">{error}</p>}

              {!closed && (
                <div className="tk-actions">
                  {t.status !== "here" && (
                    <button type="button" className="tk-btn primary" disabled={busy} onClick={() => act("here")}>I&rsquo;m here</button>
                  )}
                  <button
                    type="button"
                    className={`tk-btn${confirmCancel ? " confirm" : ""}`}
                    disabled={busy}
                    onClick={() => (confirmCancel ? act("cancel") : setConfirmCancel(true))}
                  >
                    {confirmCancel ? "Tap again to cancel" : "Cancel ticket"}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const STATUS_LABEL: Record<TicketView["status"], string> = {
  waiting: "Waiting",
  here: "Here",
  called: "Called",
  done: "Done",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

const CSS = `
  .tk-reply { display: flex; gap: 10px; }
  .tk-replied { margin: 0; font-size: 16px; padding: 14px 18px; border-radius: 18px; background: #C4D6A4; color: #000000; }
  .tk-note { background: #FDD26E; color: #000000; font-weight: 700; font-size: 16px; padding: 14px 18px; border-radius: 18px; }
  .tk-stakes { margin: 0; font-size: 14px; font-weight: 700; color: #FDD26E; }
  .tk-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .tk-theme { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 999px; border: 1px solid #C6DAE7; background: #FFFFFF; color: #000000; cursor: pointer; }
  .tk-theme:focus-visible { outline: 3px solid #D73F09; outline-offset: 2px; }
  :root[data-theme="dark"] { color-scheme: dark; }
  :root[data-theme="dark"] body, :root[data-theme="dark"] .tk { background: #000000; color: #FFFFFF; }
  :root[data-theme="dark"] .tk-home { color: #FFFFFF; }
  :root[data-theme="dark"] .tk-theme { background: #000000; color: #FFFFFF; }
  :root[data-theme="dark"] .tk-card { border: 1px solid #FFFFFF; }
  body { margin: 0; background: #FFFFFF; }
  .tk { min-height: 100vh; background: #FFFFFF; color: #000000; font-family: var(--font-sans), system-ui, sans-serif; border-top: 6px solid #D73F09; }
  .tk-wrap { max-width: 520px; margin: 0 auto; padding: 16px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
  .tk-home { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; font-size: 19px; font-weight: 700; color: #000000; text-decoration: none; align-self: flex-start; }
  .tk-banner { background: #D73F09; color: #FFFFFF; font-weight: 700; font-size: 18px; padding: 16px 18px; border-radius: 18px; }
  .tk-card { position: relative; overflow: hidden; background: #000000; color: #FFFFFF; border-radius: 22px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
  .tk-card::after { content: ""; position: absolute; right: -30px; top: -10px; width: 170px; height: 170px; background: url(/crest.webp) center / contain no-repeat; opacity: 0.12; pointer-events: none; }
  .tk-card > * { position: relative; z-index: 1; }
  .tk-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .tk-kicker { margin: 0; font-size: 14px; font-weight: 700; color: #D73F09; }
  .tk-title { margin: 4px 0 0; font-size: 32px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; }
  .tk-text { margin: 0; font-size: 15px; line-height: 1.6; color: #FFFFFF; }
  .tk-officer { color: #FFFFFF; }
  .tk-proxy { margin: 4px 0 0; font-size: 14px; }
  .tk-proxy strong { color: #FFFFFF; }
  .tk-status { font-size: 13px; font-weight: 700; border-radius: 999px; padding: 4px 12px; background: #FFFFFF; color: #000000; white-space: nowrap; }
  .tk-status.s-called { background: #D73F09; color: #FFFFFF; }
  .tk-status.s-here { background: #C4D6A4; color: #000000; }
  .tk-status.s-skipped { background: #FDD26E; color: #000000; }
  .tk-now { margin: 0; font-size: 15px; }
  .tk-now strong { color: #FFFFFF; }
  .tk-place { display: flex; align-items: baseline; gap: 10px; }
  .tk-big { font-size: 64px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; color: #D73F09; font-variant-numeric: tabular-nums; }
  .tk-wait { margin: 0; font-size: 17px; line-height: 1.5; font-variant-numeric: tabular-nums; }
  .tk-groups { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  .tk-groups strong { color: #FFFFFF; }
  .tk-fine { margin: 0; font-size: 13px; line-height: 1.5; }
  .tk-error { margin: 0; font-size: 14px; font-weight: 700; color: #FDD26E; }
  .tk-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .tk-btn { flex: 1; min-height: 52px; padding: 0 20px; border-radius: 999px; border: 1px solid #FFFFFF; background: #000000; color: #FFFFFF; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
  .tk-btn.primary { flex: 2; background: #D73F09; border-color: #D73F09; color: #FFFFFF; }
  .tk-btn:disabled { opacity: 0.6; cursor: wait; }
  .tk-btn:focus-visible, .tk-home:focus-visible { outline: 3px solid #D73F09; outline-offset: 2px; }
  .tk-btn, .tk-home { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform 0.12s ease, background-color 0.12s ease; }
  .tk-btn:active { transform: scale(0.96); }
  .tk-btn.primary:active { background: #FFFFFF; color: #000000; }
  /* Phones: the buttons stay pinned at the bottom, in thumb reach. */
  @media (max-width: 640px) {
    .tk-wrap { padding-bottom: 110px; }
    .tk-actions { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: #000000; border-top: 1px solid #FFFFFF; }
  }
  .tk-link-btn { display: flex; align-items: center; justify-content: center; text-decoration: none; }
  .tk-btn.confirm { background: #FFFFFF; color: #D73F09; border-color: #D73F09; }
  .tk-big { font-size: 44px; }
  .tk-progress { display: flex; gap: 3px; }
  .tk-progress span { flex-basis: 0; height: 10px; border-radius: 5px; border: 1px solid #FFFFFF; transition: flex-grow 0.4s cubic-bezier(0.2, 0, 0, 1); }
  .tk-progress span.ahead { background: #FFFFFF; }
  .tk-progress span.you { background: #D73F09; border-color: #D73F09; }
  .tk-sk { display: block; height: 18px; border-radius: 9px; background: #FFFFFF; opacity: 0.25; }
  .tk-sk-big { height: 56px; width: 60%; }
  .tk-done { align-items: flex-start; }
  .tk-check { width: 72px; height: 72px; border-radius: 50%; background: #D73F09; display: flex; align-items: center; justify-content: center; animation: tkPop 0.45s cubic-bezier(0.2, 0, 0, 1) both; }
  .tk-celebrate { position: fixed; inset: 0; z-index: 50; background: #D73F09; color: #FFFFFF; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center; animation: tkFade 0.25s ease both; }
  .tk-stamp { object-fit: contain; animation: tkStamp 0.5s cubic-bezier(0.2, 0, 0, 1) 0.1s both; }
  .tk-cel-no { margin: 8px 0 0; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tk-cel-title { margin: 0; font-size: 40px; font-weight: 800; letter-spacing: -0.03em; }
  .tk-cel-text { margin: 0; max-width: 320px; font-size: 17px; line-height: 1.5; }
  .tk-btn.tk-cel-btn { flex: 0 0 auto; min-height: 52px; margin-top: 12px; background: #000000 !important; border-color: #000000 !important; padding: 0 28px; }
  @keyframes tkFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes tkStamp { from { opacity: 0; transform: scale(1.6) rotate(-8deg); } to { opacity: 1; transform: none; } }
  @keyframes tkPop { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .tk *, .tk-celebrate { animation: none !important; transition: none !important; } }
`;
