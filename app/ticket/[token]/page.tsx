"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cormorant_Garamond, Lato } from "next/font/google";
import { clockAfter, waitLabel, waitRange, type TicketView } from "@/lib/jp-info";

const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-serif" });
const sans = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans" });

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alerted = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jp-ticket/${token}`, { cache: "no-store" });
    if (res.status === 404) { setMissing(true); return; }
    if (!res.ok) return;
    const data: TicketView = await res.json();
    setT(data);
    const upNext = data.status === "called" || (data.sessionLive && data.wait.onDocket && data.wait.place <= 2);
    if (upNext && !alerted.current) {
      alerted.current = true;
      chime();
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [token]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  async function act(method: "POST" | "DELETE", path: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/jp-ticket/${token}${path}`, { method });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Something went wrong. Try again.");
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

  return (
    <main className={`tk ${serif.variable} ${sans.variable}`}>
      <style>{CSS}</style>
      <div className="tk-wrap">
        <Link href="/" className="tk-home">Acacia JP</Link>

        {missing ? (
          <section className="tk-card">
            <h1 className="tk-title">Ticket not found</h1>
            <p className="tk-text">This ticket has ended or the link is wrong. Tickets close when the JP session ends. Ask the JP Chair if you think that&rsquo;s a mistake.</p>
          </section>
        ) : !t ? (
          <section className="tk-card"><p className="tk-text">Loading your ticket&hellip;</p></section>
        ) : (
          <>
            {upNext && (
              <div className="tk-banner" role="status">
                {called ? "You’re being called. Head to JP now." : "You’re up next. Start heading to JP."}
              </div>
            )}

            <section className="tk-card">
              <div className="tk-head">
                <div>
                  <p className="tk-kicker">Ticket #{t.ticketNo}</p>
                  <h1 className="tk-title">{t.name}</h1>
                  {t.roll != null && <p className="tk-text">Roll #{t.roll}</p>}
                </div>
                <span className={`tk-status s-${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </div>

              {closed ? (
                <p className="tk-text">{t.status === "done" ? "Your fines have been heard. You’re done for tonight." : "You cancelled this ticket."}</p>
              ) : queued ? (
                <>
                  {t.nowHearing && (
                    <p className="tk-now">
                      Now hearing: <strong>{t.nowHearing.roll != null ? `roll #${t.nowHearing.roll}` : "a brother"}</strong> in the {t.nowHearing.officer} group
                    </p>
                  )}
                  <div className="tk-place">
                    <span className="tk-big">{ordinal(queued.place)}</span>
                    <span className="tk-text">in line</span>
                  </div>
                  <p className="tk-wait">
                    {queued.minutesAhead === 0
                      ? (t.sessionLive ? "You’re next." : "You’re first when JP starts.")
                      : t.sessionLive
                        ? `${waitLabel(queued.minutesAhead)} from now.`
                        : t.startTime
                          ? `${waitLabel(queued.minutesAhead)} after JP starts: ${clockAfter(t.startTime, range!.lo)} to ${clockAfter(t.startTime, range!.hi)}.`
                          : `${waitLabel(queued.minutesAhead)} after JP starts.`}
                  </p>
                  <ul className="tk-groups">
                    {queued.groups.map((g) => (
                      <li key={g.officer}><strong>{g.officer}</strong> group: {ordinal(g.place)} of {g.size}</li>
                    ))}
                  </ul>
                  <p className="tk-fine">This page updates on its own. Keep it open and turn your volume up; it chimes when you&rsquo;re almost up.</p>
                </>
              ) : null}

              {error && <p className="tk-error" role="alert">{error}</p>}

              {!closed && (
                <div className="tk-actions">
                  {t.status !== "here" && (
                    <button type="button" className="tk-btn primary" disabled={busy} onClick={() => act("POST", "/here")}>I&rsquo;m here</button>
                  )}
                  <button
                    type="button"
                    className="tk-btn"
                    disabled={busy}
                    onClick={() => { if (confirm("Cancel your ticket? Your number will be deleted.")) act("DELETE", ""); }}
                  >
                    Cancel ticket
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
  body { margin: 0; background: #0A0A0A; }
  .tk { min-height: 100vh; background: #0A0A0A; color: #F0E8D0; font-family: var(--font-sans), sans-serif; }
  .tk-wrap { max-width: 520px; margin: 0 auto; padding: 20px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
  .tk-home { font-family: var(--font-serif), serif; font-size: 22px; font-weight: 700; color: #F0E8D0; text-decoration: none; }
  .tk-banner { background: #CFB53B; color: #0A0A0A; font-weight: 700; font-size: 17px; padding: 16px 18px; border-radius: 12px; }
  .tk-card { background: #141414; border: 1px solid #2A2A2A; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
  .tk-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .tk-kicker { margin: 0; font-size: 13px; font-weight: 700; color: #CFB53B; }
  .tk-title { margin: 4px 0 0; font-family: var(--font-serif), serif; font-size: 34px; font-weight: 600; line-height: 1.05; }
  .tk-text { margin: 0; font-size: 15px; line-height: 1.6; color: #A89870; }
  .tk-status { font-size: 12px; font-weight: 700; border-radius: 6px; padding: 4px 10px; background: #2A2A2A; color: #F0E8D0; white-space: nowrap; }
  .tk-status.s-called { background: #CFB53B; color: #0A0A0A; }
  .tk-status.s-here { background: #1f3a2a; color: #9ee0b5; }
  .tk-status.s-skipped { background: #3a2420; color: #F0A090; }
  .tk-now { margin: 0; font-size: 15px; color: #A89870; }
  .tk-now strong { color: #F0E8D0; }
  .tk-place { display: flex; align-items: baseline; gap: 10px; }
  .tk-big { font-family: var(--font-serif), serif; font-size: 64px; font-weight: 700; line-height: 1; color: #E2CC6A; }
  .tk-wait { margin: 0; font-size: 17px; line-height: 1.5; }
  .tk-groups { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #A89870; }
  .tk-groups strong { color: #F0E8D0; }
  .tk-fine { margin: 0; font-size: 13px; line-height: 1.5; color: #A89870; }
  .tk-error { margin: 0; font-size: 14px; color: #F08A7A; }
  .tk-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .tk-btn { min-height: 48px; padding: 0 20px; border-radius: 10px; border: 1px solid #2A2A2A; background: none; color: #F0E8D0; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
  .tk-btn.primary { background: #CFB53B; border-color: #CFB53B; color: #0A0A0A; }
  .tk-btn:disabled { opacity: 0.6; cursor: wait; }
  .tk-btn:focus-visible, .tk-home:focus-visible { outline: 2px solid #E2CC6A; outline-offset: 2px; }
`;
