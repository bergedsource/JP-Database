"use client";

import { useEffect, useState } from "react";
import { clockAfter, formatTime, waitRange, type JpInfo, type JpWait } from "@/lib/jp-info";

type Slide = "wait" | "session" | "common";
const SLIDES: { id: Slide; label: string }[] = [
  { id: "wait", label: "Your wait at JP" },
  { id: "session", label: "Next JP session" },
  { id: "common", label: "Most common fines" },
];
const ROTATE_MS = 6000;

// "House Clean (§11-140)" → { name: "House Clean", bylaw: "§11-140" }
function splitFineType(t: string): { name: string; bylaw: string } {
  const m = t.match(/^(.*?)\s*\((§[^)]+)\)\s*$/);
  return m ? { name: m[1], bylaw: m[2] } : { name: t, bylaw: "" };
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

function daysUntil(date: string): string {
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - start) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "Today.";
  if (days === 1) return "Tomorrow.";
  return `In ${days} days.`;
}

export default function JpInfoCard({
  info,
  member,
}: {
  info: JpInfo | null;
  member: { id: string; name: string; roll?: number | null } | null;
}) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [wait, setWait] = useState<JpWait | null>(null);
  const [waitFor, setWaitFor] = useState<string | null>(null);

  // Auto-advance unless someone has taken control, is hovering/focused, or prefers less motion.
  useEffect(() => {
    if (paused || hovering) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, hovering]);

  // Searching a name jumps to the wait card and holds it there.
  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    fetch(`/api/jp-wait/${member.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JpWait | null) => {
        if (cancelled) return;
        setWait(d);
        setWaitFor(member.id);
        setSlide(0);
        setPaused(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [member]);

  const go = (i: number) => {
    setSlide((i + SLIDES.length) % SLIDES.length);
    setPaused(true);
  };

  const current = SLIDES[slide].id;
  const firstName = member?.name.split(" ")[0] ?? "";
  const waitReady = member && waitFor === member.id;
  const next = info?.nextSession ?? null;

  return (
    <article
      className="card card-jp"
      aria-roledescription="carousel"
      aria-label="JP info"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovering(false); }}
    >
      <div className="jp-controls">
        <div className="jp-dots" role="tablist" aria-label="Choose a card">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === slide}
              aria-controls="jp-panel"
              aria-label={s.label}
              className={`jp-dot${i === slide ? " active" : ""}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <div className="jp-arrows">
          <button type="button" className="jp-arrow" aria-label="Previous card" onClick={() => go(slide - 1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button type="button" className="jp-arrow" aria-label="Next card" onClick={() => go(slide + 1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div id="jp-panel" role="tabpanel" aria-label={SLIDES[slide].label} aria-live={paused ? "polite" : "off"} className="jp-panel">
        {current === "wait" && (
          <>
            <h2 className="card-title">Your wait at JP</h2>
            {!member ? (
              <>
                <p className="card-text">Search your name and we&rsquo;ll estimate when you&rsquo;ll be called. Brothers go in roll # order, lowest first, and the estimate counts the fines ahead of you.</p>
                <p className="jp-big muted" aria-hidden="true">&mdash; min</p>
              </>
            ) : !waitReady ? (
              <p className="card-text">Checking the docket&hellip;</p>
            ) : !wait || !wait.onDocket ? (
              <>
                <p className="card-text">{firstName}, you have nothing on the docket for the next session. No need to wait around.</p>
                <p className="jp-big plain">You&rsquo;re clear</p>
              </>
            ) : (
              <WaitDetail wait={wait} firstName={firstName} roll={member.roll ?? null} startTime={next?.time || ""} />
            )}
          </>
        )}

        {current === "session" && (
          <>
            <h2 className="card-title">Next JP session</h2>
            {next ? (
              <>
                <p className="card-text">Pending fines are heard here. Come if you want to speak to yours.</p>
                <div className="jp-bottom">
                  <span className="jp-weekday">{new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}</span>
                  <p className="jp-big plain">{new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  <p className="jp-sub">
                    {[next.time && formatTime(next.time), next.place && `in the ${next.place.replace(/^the\s+/i, "").toLowerCase()}`].filter(Boolean).join(" ")}
                    {next.time || next.place ? ". " : ""}
                    {daysUntil(next.date)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="card-text">Not scheduled yet. The JP Chair posts the date here once it&rsquo;s set.</p>
                <p className="jp-big muted" aria-hidden="true">TBD</p>
              </>
            )}
          </>
        )}

        {current === "common" && (
          <>
            <div>
              <h2 className="card-title">Most common fines</h2>
              {info && info.totalFines > 0 && (
                <p className="card-sub">{new Date().getFullYear()} so far, out of {info.totalFines} fines</p>
              )}
            </div>
            {!info ? (
              <p className="card-text">Loading&hellip;</p>
            ) : info.commonFines.length === 0 ? (
              <p className="card-text">No fines on record yet this year.</p>
            ) : (
              <ol className="jp-common">
                {info.commonFines.map((c, i) => {
                  const { name, bylaw } = splitFineType(c.fineType);
                  return (
                    <li key={c.fineType}>
                      <span className="jp-rank">{i + 1}</span>
                      <span className="jp-common-text">
                        <span className="jp-common-name">{name}</span>
                        <span className="jp-common-meta">{bylaw ? `${bylaw}, ` : ""}{c.count} fine{c.count !== 1 ? "s" : ""}</span>
                      </span>
                      <span className="jp-common-amount">{c.amount}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function WaitDetail({
  wait,
  firstName,
  roll,
  startTime,
}: {
  wait: Extract<JpWait, { onDocket: true }>;
  firstName: string;
  roll: number | null;
  startTime: string;
}) {
  const { lo, hi } = waitRange(wait.minutesAhead);
  const first = wait.minutesAhead === 0;
  const own = wait.ownFines
    .map((f) => {
      const { name } = splitFineType(f.fineType);
      return f.count > 1 ? `${f.count} ${name.toLowerCase()} fines` : `a ${name.toLowerCase()} fine`;
    })
    .join(" and ");

  return (
    <>
      <p className="card-text">
        {firstName}, you&rsquo;re <strong>{ordinal(wait.place)}</strong> of {wait.docketSize} brothers on the docket{roll != null ? ` (roll #${roll})` : ""}.
      </p>
      <div className="jp-bottom">
        <p className="jp-big">{first ? "You’re first" : `${lo}–${hi} min`}</p>
        <p className="jp-sub">
          {first
            ? startTime ? `Be there when JP starts at ${formatTime(startTime)}.` : "Be there when JP starts."
            : `${wait.brothersAhead} brother${wait.brothersAhead !== 1 ? "s" : ""} with ${wait.finesAhead} fine${wait.finesAhead !== 1 ? "s" : ""} go before you.` +
              (startTime ? ` Expect to be called between ${clockAfter(startTime, lo)} and ${clockAfter(startTime, hi)}.` : " That’s after JP starts.")}
        </p>
        <p className="jp-sub">Your own hearing: about {Math.max(1, Math.round(wait.ownMinutes))} min for {own}.</p>
      </div>
      <div className="jp-queue" aria-hidden="true">
        {wait.queue.map((m, i) => (
          <span
            key={i}
            style={{ flexGrow: m }}
            className={i === wait.queueIndex ? "you" : i < wait.queueIndex ? "ahead" : ""}
          />
        ))}
      </div>
    </>
  );
}
