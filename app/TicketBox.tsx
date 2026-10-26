"use client";

import { useEffect, useState } from "react";
import type { TicketWindow } from "@/lib/jp-info";

// Ticket links are kept on the brother's phone so reopening the homepage takes him
// back to his ticket. They expire well before the next JP night.
const TICKET_STORE = "jp-tickets";
const TICKET_TTL_MS = 18 * 60 * 60 * 1000;

type Saved = { officer: string; token: string; ticketNo: number; at: number };

// A brother can hold one ticket per fining officer, so they're kept per member+officer.
function savedTickets(memberId: string): Saved[] {
  try {
    const all = JSON.parse(localStorage.getItem(TICKET_STORE) ?? "{}");
    return Object.entries(all)
      .filter(([k]) => k.startsWith(memberId + "|"))
      .map(([k, v]) => ({ ...(v as Omit<Saved, "officer">), officer: k.slice(memberId.length + 1) }))
      .filter((t) => Date.now() - t.at < TICKET_TTL_MS);
  } catch {
    return [];
  }
}

function saveTicket(memberId: string, officer: string, token: string, ticketNo: number) {
  try {
    const all = JSON.parse(localStorage.getItem(TICKET_STORE) ?? "{}");
    all[`${memberId}|${officer}`] = { token, ticketNo, at: Date.now() };
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
// officers: the fining officers he has pending fines from (one ticket each).
export default function TicketBox({ window: w, memberId, officers }: { window: TicketWindow; memberId: string; officers: string[] }) {
  const now = useNow(1000);
  const [saved, setSaved] = useState<Saved[]>([]);
  // Officers he's taking tickets for: one ticket each, all with the same contact.
  const [picked, setPicked] = useState<string[]>([]);
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
    const t = setTimeout(() => setSaved(savedTickets(memberId)), 0);
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

  const mine = saved.filter((t) => officers.includes(t.officer));
  const remaining = officers.filter((o) => !mine.some((t) => t.officer === o));
  const links = mine.length > 0 && (
    <div className="jp-ticket-links">
      {mine.map((t) => (
        <a key={t.officer} className="jp-ticket-btn" href={`/ticket/${t.token}`}>
          View ticket #{t.ticketNo}{officers.length > 1 ? ` (${t.officer})` : ""}
        </a>
      ))}
    </div>
  );
  if (remaining.length === 0) return <div className="jp-ticket">{links}</div>;

  // With only one officer left there's nothing to choose.
  const chosen = remaining.length === 1 ? remaining : picked.filter((o) => remaining.includes(o));

  async function take(e: React.FormEvent) {
    e.preventDefault();
    if (chosen.length === 0) { setError("Choose at least one fining officer."); return; }
    setBusy(true);
    setError("");
    // One ticket per officer (the server allows one per brother per officer).
    const made: { token: string }[] = [];
    const failed: string[] = [];
    for (const officer of chosen) {
      const res = await fetch("/api/jp-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId, fining_officer: officer, contact, phone, snapchat, proxy, proxy_name: proxy ? proxyName : "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        saveTicket(memberId, officer, data.token, data.ticketNo);
        made.push({ token: data.token });
      } else {
        failed.push(data.error ?? `Couldn't take a ticket for ${officer}.`);
      }
    }
    if (made.length === 1 && failed.length === 0) {
      window.location.assign(`/ticket/${made[0].token}`);
      return;
    }
    // Several tickets: stay here and list them, so he can open each one.
    setSaved(savedTickets(memberId));
    setPicked([]);
    if (failed.length === 0) setFormOpen(false);
    setError(failed.join(" "));
    setBusy(false);
  }

  return (
    <div className="jp-ticket">
      {links}
      {!formOpen ? (
        <button type="button" className="jp-ticket-btn" onClick={() => setFormOpen(true)}>
          {mine.length ? "Take another ticket" : "Take a ticket"}
        </button>
      ) : (
        <form onSubmit={take} className="jp-ticket-form">
          {remaining.length === 1 ? (
            <p className="jp-ticket-line">For <strong>{remaining[0]}</strong>&rsquo;s fines</p>
          ) : (
            <fieldset className="jp-officers">
              <legend className="jp-ticket-label">Fining officers (pick one or more)</legend>
              {remaining.map((o) => (
                <label key={o} className="jp-ticket-check">
                  <input
                    type="checkbox"
                    checked={picked.includes(o)}
                    onChange={(e) => { setPicked((p) => (e.target.checked ? [...p, o] : p.filter((x) => x !== o))); setError(""); }}
                  />
                  {o}
                </label>
              ))}
            </fieldset>
          )}
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
              ) : proxy ? (
                // The chair already has every brother's Snapchat, but not a proxy's.
                <input
                  key="snap"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Proxy's Snapchat username"
                  placeholder="@username"
                  className="search-input jp-ticket-input"
                  value={snapchat}
                  onChange={(e) => { setSnapchat(e.target.value); setError(""); }}
                  required
                  autoFocus
                />
              ) : null}
              <button type="submit" className="jp-ticket-btn" disabled={busy}>{busy ? "Taking…" : chosen.length > 1 ? `Take ${chosen.length} tickets` : "Take ticket"}</button>
            </div>
          )}
          {error && <p className="jp-ticket-error" role="alert">{error}</p>}
          {contact && (
            <p className="jp-ticket-fine">
              {contact === "phone"
                ? (proxy ? "The JP Chair calls or texts your proxy at this number when it’s your turn." : "The JP Chair calls or texts you at this number when you’re up.")
                : (proxy ? "The JP Chair messages your proxy on Snapchat when it’s your turn." : "The JP Chair will Snapchat you when you’re up. No username needed.")}
              {(contact === "phone" || proxy) && " It’s deleted when the session ends."}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
