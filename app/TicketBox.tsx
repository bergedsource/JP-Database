"use client";

import { useEffect, useState } from "react";
import type { TicketWindow } from "@/lib/jp-info";

// Ticket links are kept on the brother's phone so reopening the homepage takes him
// back to his ticket. They expire well before the next JP night.
const TICKET_STORE = "jp-tickets";
const TICKET_TTL_MS = 18 * 60 * 60 * 1000;

function savedTicket(memberId: string): { token: string; ticketNo: number } | null {
  try {
    const all = JSON.parse(localStorage.getItem(TICKET_STORE) ?? "{}");
    const t = all[memberId];
    return t && Date.now() - t.at < TICKET_TTL_MS ? t : null;
  } catch {
    return null;
  }
}

function saveTicket(memberId: string, token: string, ticketNo: number) {
  try {
    const all = JSON.parse(localStorage.getItem(TICKET_STORE) ?? "{}");
    all[memberId] = { token, ticketNo, at: Date.now() };
    localStorage.setItem(TICKET_STORE, JSON.stringify(all));
  } catch {}
}

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function countdown(toIso: string, now: number): string {
  const s = Math.max(0, Math.round((new Date(toIso).getTime() - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function opensAtLabel(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" })
    .replace(" AM", " am")
    .replace(" PM", " pm");
}

// One line for the "Next JP session" panel.
export function TicketWindowLine({ window: w }: { window: TicketWindow }) {
  const now = useNow(1000);
  if (w.state === "soon") {
    return <p className="jp-ticket-line">Tickets open {opensAtLabel(w.opensAt)}, in <strong>{countdown(w.opensAt, now)}</strong>.</p>;
  }
  if (w.state === "open") return <p className="jp-ticket-line">Tickets are open. Search your name to take one.</p>;
  return null;
}

// Under "Your wait at JP": take a ticket so you can wait in your room; the JP Chair
// calls or texts when you're close.
export default function TicketBox({ window: w, memberId }: { window: TicketWindow; memberId: string }) {
  const now = useNow(1000);
  const [saved, setSaved] = useState<{ token: string; ticketNo: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // localStorage only exists in the browser, so read it after mount.
  useEffect(() => {
    const t = setTimeout(() => setSaved(savedTicket(memberId)), 0);
    return () => clearTimeout(t);
  }, [memberId]);

  if (w.state === "none") return null;

  if (w.state === "soon") {
    return (
      <div className="jp-ticket">
        <p className="jp-ticket-line">
          Tickets open {opensAtLabel(w.opensAt)}, in <strong>{countdown(w.opensAt, now)}</strong>. Take one then and wait in your room.
        </p>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="jp-ticket">
        <a className="jp-ticket-btn" href={`/ticket/${saved.token}`}>View my ticket #{saved.ticketNo}</a>
      </div>
    );
  }

  async function take(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/jp-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId, phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      saveTicket(memberId, data.token, data.ticketNo);
      window.location.href = `/ticket/${data.token}`;
      return;
    }
    setError(data.error ?? "Couldn't take a ticket. Try again.");
    setBusy(false);
  }

  return (
    <div className="jp-ticket">
      {!formOpen ? (
        <button type="button" className="jp-ticket-btn" onClick={() => setFormOpen(true)}>Take a ticket</button>
      ) : (
        <form onSubmit={take} className="jp-ticket-form">
          <label htmlFor="jp-phone" className="jp-ticket-label">Your phone number</label>
          <div className="jp-ticket-row">
            <input
              id="jp-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(541) 555-1234"
              className="search-input jp-ticket-input"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(""); }}
              required
              autoFocus
            />
            <button type="submit" className="jp-ticket-btn" disabled={busy}>{busy ? "Taking…" : "Take ticket"}</button>
          </div>
          {error && <p className="jp-ticket-error" role="alert">{error}</p>}
          <p className="jp-ticket-fine">The JP Chair uses this number to call or text you when you&rsquo;re up. It&rsquo;s deleted when the session ends.</p>
        </form>
      )}
    </div>
  );
}
