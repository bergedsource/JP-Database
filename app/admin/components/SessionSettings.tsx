"use client";

import { useEffect, useState } from "react";
import { NEXT_SESSION_KEY, formatTime, parseNextSession } from "@/lib/jp-info";

async function saveSetting(key: string, value: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  } catch {
    return "No connection. Try again.";
  }
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error ?? "Couldn't save. Try again.";
}

function preview(date: string, time: string, place: string): string {
  const day = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return `${day}${time ? `, ${formatTime(time)}` : ""}${place ? ` at ${place}` : ""}.`;
}

// Owner/root control on the Sessions list: the next session shown on the member homepage.
export default function SessionSettings() {
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [place, setPlace] = useState("");
  const [sessionMsg, setSessionMsg] = useState("");
  const [sessionErr, setSessionErr] = useState("");
  const [sessionSaving, setSessionSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, string>) => {
        const next = parseNextSession(d[NEXT_SESSION_KEY]);
        if (next) {
          setDate(next.date);
          setTime(next.time || "19:00");
          setPlace(next.place);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function saveSession(e: React.FormEvent) {
    e.preventDefault();
    setSessionSaving(true);
    setSessionErr("");
    setSessionMsg("");
    const err = await saveSetting(NEXT_SESSION_KEY, JSON.stringify({ date, time, place: place.trim() }));
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

  if (!loaded) return null;

  return (
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
            {date ? <>Members see: <strong>{preview(date, time, place.trim())}</strong> </> : "Nothing posted, so the homepage says the next session isn't scheduled yet. "}
            Starting a session on or after this date takes it down automatically.
          </p>
          {sessionErr && <p className="adm-error" role="alert">{sessionErr}</p>}
          {sessionMsg && <p className="ses-saved" role="status">{sessionMsg}</p>}
        </form>
      </section>
  );
}
