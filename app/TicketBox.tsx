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
  // Nothing chosen until he taps Phone # or Snapchat; then that box appears.
  const [contact, setContact] = useState<"phone" | "snapchat" | null>(null);
  const [phone, setPhone] = useState("");
  const [snapchat, setSnapchat] = useState("");
  const [proxy, setProxy] = useState(false);
  const [proxyName, setProxyName] = useState("");
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
      body: JSON.stringify({ member_id: memberId, contact, phone, snapchat, proxy, proxy_name: proxy ? proxyName : "" }),
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
          <label className="jp-ticket-check">
            <input type="checkbox" checked={proxy} onChange={(e) => { setProxy(e.target.checked); setError(""); }} />
            I&rsquo;m sending a proxy
          </label>
          {proxy && (
            <>
              <label htmlFor="jp-proxy" className="jp-ticket-label">Proxy&rsquo;s name</label>
              <input
                id="jp-proxy"
                type="text"
                autoComplete="off"
                maxLength={60}
                placeholder="Who's going for you"
                className="search-input jp-ticket-input"
                value={proxyName}
                onChange={(e) => { setProxyName(e.target.value); setError(""); }}
                required
              />
            </>
          )}
          <span className="jp-ticket-label" id="jp-contact-label">{proxy ? "How to reach your proxy" : "How to reach you"}</span>
          <div className="jp-contact" role="radiogroup" aria-labelledby="jp-contact-label">
            {(["phone", "snapchat"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={contact === c}
                className={`jp-contact-opt${contact === c ? " on" : ""}`}
                onClick={() => { setContact(c); setError(""); }}
              >
                {c === "phone" ? "Phone #" : "Snapchat"}
              </button>
            ))}
          </div>
          {contact && (
            <div className="jp-ticket-row">
              {contact === "phone" ? (
                <input
                  key="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label={proxy ? "Proxy's phone number" : "Your phone number"}
                  placeholder="(541) 555-1234"
                  className="search-input jp-ticket-input"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(""); }}
                  required
                  autoFocus
                />
              ) : (
                <input
                  key="snap"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label={proxy ? "Proxy's Snapchat username" : "Your Snapchat username"}
                  placeholder="@username"
                  className="search-input jp-ticket-input"
                  value={snapchat}
                  onChange={(e) => { setSnapchat(e.target.value); setError(""); }}
                  required
                  autoFocus
                />
              )}
              <button type="submit" className="jp-ticket-btn" disabled={busy}>{busy ? "Taking…" : "Take ticket"}</button>
            </div>
          )}
          {error && <p className="jp-ticket-error" role="alert">{error}</p>}
          {contact && (
            <p className="jp-ticket-fine">
              {contact === "phone"
                ? (proxy ? "The JP Chair calls or texts your proxy at this number when it’s your turn." : "The JP Chair calls or texts you at this number when you’re up.")
                : (proxy ? "The JP Chair messages your proxy on Snapchat when it’s your turn." : "The JP Chair messages you on Snapchat when you’re up.")}
              {" "}It&rsquo;s deleted when the session ends.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
