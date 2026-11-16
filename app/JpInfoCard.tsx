"use client";

import { formatTime, type JpInfo } from "@/lib/jp-info";

// The homepage's JP cards: when the next session is, and the most common fines.

// "House Clean (§11-140)" → { name: "House Clean", bylaw: "§11-140" }
function splitFineType(t: string): { name: string; bylaw: string } {
  const m = t.match(/^(.*?)\s*\((§[^)]+)\)\s*$/);
  return m ? { name: m[1], bylaw: m[2] } : { name: t, bylaw: "" };
}

export function NextJpCard({ info }: { info: JpInfo | null }) {
  const next = info?.nextSession ?? null;
  return (
    <article className="card card-dark" aria-label="Next JP session">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/crest.webp" alt="" className="card-watermark" aria-hidden="true" />
      <p className="card-kicker">Next JP</p>
      {next ? (
        <>
          <p className="jp-date">
            {new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}
            <br />
            {new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {next.time ? `, ${formatTime(next.time)}` : ""}
          </p>
          {next.place && <p className="jp-place">At {next.place}</p>}
        </>
      ) : (
        <p className="jp-place">Not scheduled yet. The JP Chair posts the date here once it&rsquo;s set.</p>
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
