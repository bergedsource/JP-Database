"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_HEARING_MINUTES,
  HEARING_MINUTES_KEY,
  NEXT_SESSION_KEY,
  TIER_EXAMPLES,
  TIER_LABELS,
  formatTime,
  parseHearingMinutes,
  parseNextSession,
  type HearingMinutes,
  type HearingTier,
} from "@/lib/jp-info";

const TIERS: HearingTier[] = ["quick", "standard", "long", "longest"];

async function saveSetting(key: string, value: string): Promise<string | null> {
  const res = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error ?? "Couldn't save. Try again.";
}

function preview(date: string, time: string, place: string): string {
  const day = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return `${day}${time ? `, ${formatTime(time)}` : ""}${place ? ` in the ${place.replace(/^the\s+/i, "").toLowerCase()}` : ""}.`;
}

// Owner/root controls on the Sessions list: the next session shown on the member
// homepage, and the per-fine minutes behind each brother's wait estimate.
export default function SessionSettings() {
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [place, setPlace] = useState("");
  const [ticketsOpen, setTicketsOpen] = useState("17:00");
  const [sessionMsg, setSessionMsg] = useState("");
  const [sessionErr, setSessionErr] = useState("");
  const [sessionSaving, setSessionSaving] = useState(false);

  const [mins, setMins] = useState<Record<keyof HearingMinutes, string>>(() => toDraft(DEFAULT_HEARING_MINUTES));
  const [minsMsg, setMinsMsg] = useState("");
  const [minsErr, setMinsErr] = useState("");
  const [minsSaving, setMinsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, string>) => {
        const next = parseNextSession(d[NEXT_SESSION_KEY]);
        if (next) {
          setDate(next.date);
          setTime(next.time || "19:00");
          setPlace(next.place);
          setTicketsOpen(next.ticketsOpen || "17:00");
        }
        setMins(toDraft(parseHearingMinutes(d[HEARING_MINUTES_KEY])));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function saveSession(e: React.FormEvent) {
    e.preventDefault();
    setSessionSaving(true);
    setSessionErr("");
    setSessionMsg("");
    const err = await saveSetting(NEXT_SESSION_KEY, JSON.stringify({ date, time, place: place.trim(), ticketsOpen }));
    if (err) setSessionErr(err);
    else setSessionMsg("Saved. It's on the homepage now.");
    setSessionSaving(false);
  }

  async function clearSession() {
    setSessionSaving(true);
    setSessionErr("");
    setSessionMsg("");
    const err = await saveSetting(NEXT_SESSION_KEY, "");
    if (err) setSessionErr(err);
    else {
      setDate("");
      setPlace("");
      setSessionMsg("Cleared. The homepage says the next session isn't scheduled yet.");
    }
    setSessionSaving(false);
  }

  async function saveMinutes(e: React.FormEvent) {
    e.preventDefault();
    const out: Partial<HearingMinutes> = {};
    for (const k of Object.keys(mins) as (keyof HearingMinutes)[]) {
      const n = Number(mins[k]);
      if (mins[k].trim() === "" || !isFinite(n) || n < 0 || n > 60) {
        setMinsErr("Each time has to be a number of minutes from 0 to 60.");
        return;
      }
      out[k] = n;
    }
    setMinsSaving(true);
    setMinsErr("");
    setMinsMsg("");
    const err = await saveSetting(HEARING_MINUTES_KEY, JSON.stringify(out));
    if (err) setMinsErr(err);
    else setMinsMsg("Saved. Wait estimates use these times now.");
    setMinsSaving(false);
  }

  if (!loaded) return null;

  return (
    <>
      <section className="adm-card ses-next" aria-labelledby="ses-next-title">
        <div className="adm-card-header ses-card-header">
          <h2 id="ses-next-title" className="adm-card-title">Next session</h2>
          <span className="ses-card-hint">Shows on the member homepage</span>
        </div>
        <form className="adm-card-body ses-next-form" onSubmit={saveSession}>
          <div className="ses-next-fields">
            <div>
              <label className="adm-label" htmlFor="ns-date">Date</label>
              <input id="ns-date" type="date" className="adm-input" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label className="adm-label" htmlFor="ns-time">Start time</label>
              <input id="ns-time" type="time" className="adm-input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label className="adm-label" htmlFor="ns-tickets">Tickets open</label>
              <input id="ns-tickets" type="time" className="adm-input" value={ticketsOpen} onChange={(e) => setTicketsOpen(e.target.value)} />
            </div>
            <div className="ses-next-place">
              <label className="adm-label" htmlFor="ns-place">Place</label>
              <input id="ns-place" type="text" className="adm-input" maxLength={80} placeholder="Chapter room" value={place} onChange={(e) => setPlace(e.target.value)} />
            </div>
            <button type="submit" className="adm-btn" disabled={sessionSaving || !date}>Save</button>
            {date && (
              <button type="button" className="ses-choice" disabled={sessionSaving} onClick={clearSession}>Clear</button>
            )}
          </div>
          <p className="ses-next-preview">
            {date ? <>Members see: <strong>{preview(date, time, place.trim())}</strong> Tickets open at <strong>{ticketsOpen ? formatTime(ticketsOpen) : "the start time"}</strong> that day, with a countdown until then. </> : "Nothing posted, so the homepage says the next session isn't scheduled yet. "}
            Starting a session on or after this date takes it down automatically.
          </p>
          {sessionErr && <p className="adm-error" role="alert">{sessionErr}</p>}
          {sessionMsg && <p className="ses-saved" role="status">{sessionMsg}</p>}
        </form>
      </section>

      <details className="adm-card ses-timing">
        <summary className="adm-card-header ses-card-header">
          <span className="adm-card-title">Hearing time estimates</span>
          <span className="ses-card-hint">Used for each brother&rsquo;s wait on the homepage</span>
        </summary>
        <form className="adm-card-body" onSubmit={saveMinutes}>
          {TIERS.map((t) => (
            <div key={t} className="ses-timing-row">
              <span className="ses-timing-name">{TIER_LABELS[t]}</span>
              <label className="ses-timing-input">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="60"
                  className="adm-input"
                  aria-label={`Minutes for ${TIER_LABELS[t].toLowerCase()} fines`}
                  value={mins[t]}
                  onChange={(e) => { setMins({ ...mins, [t]: e.target.value }); setMinsErr(""); }}
                />
                <span>min</span>
              </label>
              <span className="ses-timing-desc">{TIER_EXAMPLES[t]}</span>
            </div>
          ))}
          <div className="ses-timing-row">
            <span className="ses-timing-name">Per brother</span>
            <label className="ses-timing-input">
              <input
                type="number"
                step="0.5"
                min="0"
                max="60"
                className="adm-input"
                aria-label="Minutes added per brother"
                value={mins.perBrother}
                onChange={(e) => { setMins({ ...mins, perBrother: e.target.value }); setMinsErr(""); }}
              />
              <span>min</span>
            </label>
            <span className="ses-timing-desc">Walking in and out. Repeats of the same fine count half.</span>
          </div>
          {minsErr && <p className="adm-error" role="alert">{minsErr}</p>}
          {minsMsg && <p className="ses-saved" role="status">{minsMsg}</p>}
          <div className="ses-timing-actions">
            <button type="button" className="ses-choice" onClick={() => { setMins(toDraft(DEFAULT_HEARING_MINUTES)); setMinsErr(""); }}>
              Reset to defaults
            </button>
            <button type="submit" className="adm-btn" disabled={minsSaving}>{minsSaving ? "Saving…" : "Save times"}</button>
          </div>
        </form>
      </details>
    </>
  );
}

function toDraft(m: HearingMinutes): Record<keyof HearingMinutes, string> {
  return {
    quick: String(m.quick),
    standard: String(m.standard),
    long: String(m.long),
    longest: String(m.longest),
    perBrother: String(m.perBrother),
  };
}
