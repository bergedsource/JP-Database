"use client";

import { useEffect, useState } from "react";
import { clockAfter, formatTime, waitLabel, waitRange, type JpInfo, type JpWait } from "@/lib/jp-info";
import TicketBox, { TicketWindowLine } from "./TicketBox";

// The homepage's JP cards: next session + who's in line, your wait, and the most
// common fines. All three show at once (no carousel) so nobody waits for a slide.

// "House Clean (§11-140)" → { name: "House Clean", bylaw: "§11-140" }
function splitFineType(t: string): { name: string; bylaw: string } {
  const m = t.match(/^(.*?)\s*\((§[^)]+)\)\s*$/);
  return m ? { name: m[1], bylaw: m[2] } : { name: t, bylaw: "" };
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}’` : `${name}’s`;
}

export function NextJpCard({ info }: { info: JpInfo | null }) {
  const next = info?.nextSession ?? null;
  const line = info?.line;
  return (
    <article className="card card-dark" aria-label="Next JP session">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/crest.webp" alt="" className="card-watermark" aria-hidden="true" />
      <p className="card-kicker">{info?.sessionLive ? "JP is in session" : "Next JP"}</p>
      {next || info?.sessionLive ? (
        <>
          {next && (
            <>
              <p className="jp-date">
                {new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}
                <br />
                {new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {next.time ? `, ${formatTime(next.time)}` : ""}
              </p>
              {next.place && <p className="jp-place">At {next.place}</p>}
            </>
          )}
          {line && line.upNext.length > 0 && (
            <div className="jp-line">
              <div className="jp-line-head">
                <p className="jp-line-title">Who&rsquo;s in line</p>
                <p className="jp-line-count">{line.brothers} brother{line.brothers !== 1 ? "s" : ""}</p>
              </div>
              {/* A brother fined by several officers is heard once per group, so label each group. */}
              <ol className="jp-line-list">
                {line.upNext.map((b, i) => (
                  <li key={`${b.officer}-${b.name}-${i}`} className="jp-line-item">
                    {(i === 0 || line.upNext[i - 1].officer !== b.officer) && (
                      <span className="jp-line-group">{possessive(b.officer)} fines{i === 0 ? " · first up" : ""}</span>
                    )}
                    <span className={`jp-line-row${i === 0 ? " first" : ""}`}>
                      <span className="jp-line-roll">{b.roll != null ? `#${b.roll}` : "—"}</span>
                      <span className="jp-line-name">{b.name}</span>
                      {i === 0 && <span className="jp-line-tag">{info?.sessionLive ? "Now" : "Next up"}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              {line.brothers > line.upNext.length && (
                <p className="jp-line-more">+ {line.brothers - line.upNext.length} more · lowest roll # goes first in each group</p>
              )}
            </div>
          )}
          {info?.tickets && info.tickets.state !== "none" && (
            <div className="jp-window"><TicketWindowLine window={info.tickets} /></div>
          )}
        </>
      ) : (
        <p className="jp-place">Not scheduled yet. The JP Chair posts the date here once it&rsquo;s set.</p>
      )}
    </article>
  );
}

export function WaitCard({
  info,
  member,
}: {
  info: JpInfo | null;
  member: { id: string; name: string; roll?: number | null } | null;
}) {
  const [wait, setWait] = useState<JpWait | null>(null);
  const [waitFor, setWaitFor] = useState<string | null>(null);

  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    fetch(`/api/jp-wait/${member.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JpWait | null) => {
        if (cancelled) return;
        setWait(d);
        setWaitFor(member.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [member]);

  const firstName = member?.name.split(" ")[0] ?? "";
  const waitReady = member && waitFor === member.id;
  const next = info?.nextSession ?? null;

  return (
    <article className="card" aria-label="Your wait at JP">
      <p className="card-kicker-muted">Your wait at JP</p>
      {!member ? (
        <p className="card-text">Search your name and we&rsquo;ll show when you&rsquo;re likely to be heard.</p>
      ) : !waitReady ? (
        <p className="card-text">Checking the docket&hellip;</p>
      ) : !wait || !wait.onDocket ? (
        <>
          <p className="big-figure">You&rsquo;re clear</p>
          <p className="card-text">{firstName}, nothing of yours is on the docket. No need to come.</p>
        </>
      ) : (
        <>
          <WaitDetail wait={wait} roll={member.roll ?? null} startTime={info?.sessionLive ? "" : next?.time || ""} live={!!info?.sessionLive} />
          <TicketBox window={info?.tickets ?? { state: "none" }} memberId={member.id} officers={wait.groups.map((g) => g.officer)} />
        </>
      )}
    </article>
  );
}

export function CommonFinesCard({ info }: { info: JpInfo | null }) {
  return (
    <article className="card" aria-label="Most common fines">
      <div>
        <p className="card-kicker-muted">Most common fines</p>
        {info && info.totalFines > 0 && <p className="card-sub">{new Date().getFullYear()} so far, out of {info.totalFines} fines</p>}
      </div>
      {!info ? (
        <p className="card-text">Loading&hellip;</p>
      ) : info.commonFines.length === 0 ? (
        <p className="card-text">No fines on record yet this year.</p>
      ) : (
        <ol className="jp-common">
          {info.commonFines.map((c) => {
            const { name, bylaw } = splitFineType(c.fineType);
            return (
              <li key={c.fineType}>
                <span className="jp-common-text">
                  <span className="jp-common-name">{name}</span>
                  <span className="jp-common-meta">{bylaw ? `${bylaw} · ` : ""}{c.amount}</span>
                </span>
                <span className="jp-common-count">{c.count}</span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

function WaitDetail({
  wait,
  roll,
  startTime,
  live,
}: {
  wait: Extract<JpWait, { onDocket: true }>;
  roll: number | null;
  startTime: string;
  live: boolean;
}) {
  const { lo, hi } = waitRange(wait.minutesAhead);
  const first = wait.minutesAhead === 0;
  const own = wait.ownFines
    .map((f) => {
      const { name } = splitFineType(f.fineType);
      return f.count > 1 ? `${f.count} ${name.toLowerCase()} fines` : `a ${name.toLowerCase()} fine`;
    })
    .join(" and ");
  // A clock window ("7:35–7:45 pm") beats a duration: known waits feel shorter.
  const window = !first && !live && startTime ? `${clockAfter(startTime, lo)}–${clockAfter(startTime, hi)}` : "";

  return (
    <>
      <div>
        <p className="card-sub">{first ? "You’re up" : window ? "You’ll likely be heard" : "Your wait"}</p>
        <p className="big-figure">{first ? (live ? "You’re next" : "You’re first") : window || waitLabel(wait.minutesAhead)}</p>
      </div>
      <div className="jp-queue" aria-hidden="true">
        {wait.queue.map((m, i) => (
          <span key={i} style={{ flexGrow: m }} className={i === wait.queueIndex ? "you" : i < wait.queueIndex ? "ahead" : ""} />
        ))}
      </div>
      <p className="card-text">
        You&rsquo;re <strong>{ordinal(wait.place)}</strong> in line{roll != null ? ` (roll #${roll})` : ""}
        {first
          ? startTime ? `. Be there when JP starts at ${formatTime(startTime)}.` : ". Be there when JP starts."
          : `, after ${wait.brothersAhead} brother${wait.brothersAhead !== 1 ? "s" : ""} with ${wait.finesAhead} fine${wait.finesAhead !== 1 ? "s" : ""}.`}{" "}
        Your hearing takes about {Math.max(1, Math.round(wait.ownMinutes))} min for {own}.
      </p>
      <p className="card-text">
        <strong>Why this spot:</strong>{" "}
        {wait.groups.map((g, i) => (
          <span key={g.officer}>{i > 0 ? " and " : "you’re in "}{possessive(g.officer)} group ({ordinal(g.place)} of {g.size})</span>
        ))}
        . Officers who fined the most brothers go first, and inside each group the lowest roll # goes first.
      </p>
      <p className="card-note">No need to wait in the hall. Take a ticket and we&rsquo;ll call you when you&rsquo;re next.</p>
    </>
  );
}
