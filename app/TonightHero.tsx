"use client";

import { useEffect, useRef, useState } from "react";
import { clockAfter, formatTime, waitLabel, waitRange, type JpInfo, type JpWait, type TicketView } from "@/lib/jp-info";
import TicketBox, { allSavedTickets } from "./TicketBox";
import { ticketOfficers } from "./JpInfoCard";
import { haptic } from "@/lib/haptics";

// The top of the homepage on JP day. Members said the ticket was too hard to find
// (it sat two screens down, behind a name search), so when tickets are open the
// page opens on it:
//   - holding a ticket on this phone → that ticket, live (place, brothers ahead)
//   - this phone remembers who you are → "Hey Dillon" + one Take a ticket button
//   - otherwise → "JP is tonight" + a name box that opens the ticket sheet
// Before tickets open it's one quiet line with the date and when they open.

export type MemberLite = { id: string; name: string; roll?: number | null };
export type SavedTicket = ReturnType<typeof allSavedTickets>[number];

const ME_KEY = "jp-me";

export function readMe(): MemberLite | null {
  try {
    const m = JSON.parse(localStorage.getItem(ME_KEY) ?? "null");
    return m && typeof m.id === "string" && typeof m.name === "string" ? { id: m.id, name: m.name, roll: m.roll ?? null } : null;
  } catch {
    return null;
  }
}

export function rememberMe(m: MemberLite) {
  try { localStorage.setItem(ME_KEY, JSON.stringify({ id: m.id, name: m.name, roll: m.roll ?? null })); } catch {}
}

export function forgetMe() {
  try { localStorage.removeItem(ME_KEY); } catch {}
}

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function dayWord(date: string): string {
  if (date === todayPacific()) return "tonight";
  return new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// "6d 11h", "3h 20m", "4m"
function countdown(toIso: string, now: number): string {
  const m = Math.max(0, Math.round((new Date(toIso).getTime() - now) / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Before tickets open the button is still there (so nobody hunts for it), just
// greyed out with when it opens.
function TakeButton({ opensAt, label, onClick }: { opensAt: string | null; label: string; onClick: () => void }) {
  const now = useNow(30000);
  if (opensAt) {
    return (
      <>
        <button type="button" className="tn-btn" disabled aria-describedby="tn-opens">
          <TicketIcon />
          {label}
        </button>
        <p className="tn-opens" id="tn-opens">Opens {opensAtLabel(opensAt)} · in <strong>{countdown(opensAt, now)}</strong></p>
      </>
    );
  }
  return (
    <button type="button" className="tn-btn press" onClick={onClick}>
      <TicketIcon />
      {label}
    </button>
  );
}

function opensAtLabel(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" })
    .replace(" AM", " am")
    .replace(" PM", " pm");
}

// "8:20–8:35 pm" before JP starts, "15–25 min" once it's running, "" if he's first.
function likelyWhen(wait: Extract<JpWait, { onDocket: true }>, startTime: string, live: boolean): string {
  if (wait.minutesAhead === 0) return live ? "you’re next" : "you’re first";
  if (!live && startTime) {
    const { lo, hi } = waitRange(wait.minutesAhead);
    return `likely heard ${clockAfter(startTime, lo)}–${clockAfter(startTime, hi)}`;
  }
  return `about ${waitLabel(wait.minutesAhead)} away`;
}

// Name box with suggestions from the public roster.
export function NamePicker({
  id,
  members,
  onPick,
  autoFocus = false,
  inputRef,
}: {
  id: string;
  members: MemberLite[];
  onPick: (m: MemberLite) => void;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const query = q.trim().toLowerCase();
  const matches = query ? members.filter((m) => m.name.toLowerCase().includes(query)).slice(0, 6) : [];
  function pick(m: MemberLite) {
    haptic();
    setQ(m.name);
    setOpen(false);
    onPick(m);
  }
  return (
    <div className="tn-picker">
      <input
        id={id}
        ref={inputRef}
        type="text"
        className="tn-input"
        placeholder="Start typing your name"
        autoComplete="off"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); pick(matches[0]); } }}
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={`${id}-list`}
      />
      {open && matches.length > 0 && (
        <ul className="suggestions" id={`${id}-list`} role="listbox">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="suggestion-item press"
                // pointerdown runs before the input's blur closes the list
                onPointerDown={(e) => { e.preventDefault(); pick(m); }}
                onClick={() => pick(m)}
              >
                <span className="suggestion-name">{m.name}</span>
                <span className="suggestion-status">{m.roll != null ? `Roll #${m.roll}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Before tickets open: one plain line, not a big panel people learn to skip.
export function TonightStrip({ info }: { info: JpInfo }) {
  const next = info.nextSession;
  if (info.tickets.state !== "soon" || !next) return null;
  const date = new Date(next.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="container">
      <p className="tn-strip">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></svg>
        <span>
          <strong>Next JP: {date}{next.time ? `, ${formatTime(next.time)}` : ""}{next.place ? ` at ${next.place}` : ""}</strong>
          <br />
          Take a ticket here once they open, {opensAtLabel(info.tickets.opensAt)}.
        </span>
      </p>
    </div>
  );
}

export function TonightHero({
  info,
  members,
  me,
  saved,
  onPickMe,
  onForgetMe,
  onOpenSheet,
  onSeeFines,
}: {
  info: JpInfo;
  members: MemberLite[];
  me: MemberLite | null;
  saved: SavedTicket[];
  onPickMe: (m: MemberLite) => void;
  onForgetMe: () => void;
  onOpenSheet: (m: MemberLite | null) => void;
  onSeeFines: (m: MemberLite | null) => void;
}) {
  const [views, setViews] = useState<Record<string, TicketView | "gone">>({});
  const tokens = saved.map((t) => t.token).join(",");

  // Live status for each ticket on this phone, refreshed every 20 s.
  useEffect(() => {
    if (!tokens) return;
    let stop = false;
    const load = () =>
      Promise.all(
        tokens.split(",").map((tk) =>
          fetch(`/api/jp-ticket/${tk}`)
            .then(async (r): Promise<TicketView | "gone" | null> => (r.status === 404 ? "gone" : r.ok ? ((await r.json()) as TicketView) : null))
            .then((v) => [tk, v] as const)
            .catch(() => [tk, null] as const),
        ),
      ).then((rows) => {
        if (stop) return;
        setViews((old) => {
          const next = { ...old };
          for (const [tk, v] of rows) if (v) next[tk] = v;
          return next;
        });
      });
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 20000);
    return () => { stop = true; clearInterval(t); };
  }, [tokens]);

  if (info.tickets.state === "none") return null;
  const opensAt = info.tickets.state === "soon" ? info.tickets.opensAt : null;

  const next = info.nextSession;
  const live = info.sessionLive;
  const when = live ? "JP is on now" : next ? `JP is ${dayWord(next.date)}` : "JP is tonight";
  const where = [next?.time && !live ? formatTime(next.time) : "", next?.place ? `at ${next.place}` : ""].filter(Boolean).join(" ");

  // Tickets on this phone that still matter (not cancelled, not deleted).
  const active = saved.filter((t) => {
    const v = views[t.token];
    return v !== "gone" && !(v && v.status === "cancelled");
  });

  if (!opensAt && active.length > 0) {
    const note = active.map((t) => views[t.token]).find((v): v is TicketView => !!v && v !== "gone" && !!v.note)?.note;
    return (
      <section className="tn tn-dark" aria-label="Your JP ticket">
        <div className="container tn-inner">
          <p className="tn-kicker">Your ticket · {live ? "JP is on now" : when}</p>
          {active.map((t) => {
            const v = views[t.token];
            const view = v && v !== "gone" ? v : null;
            const w = view?.wait.onDocket ? view.wait : null;
            const status = view?.status;
            const line = !view
              ? `${t.officer} group`
              : status === "done"
                ? `${t.officer} group · you’re done`
                : status === "called"
                  ? `${t.officer} group · you’re called, go now`
                  : w
                    ? `${t.officer} group · ${likelyWhen(w, view.startTime, view.sessionLive)}`
                    : `${t.officer} group`;
            return (
              <a key={t.token} href={`/ticket/${t.token}`} className={`tn-ticket press${status === "called" ? " called" : ""}`}>
                <span className="tn-ticket-top">
                  <span>
                    <span className="tn-ticket-label">Ticket</span>
                    <span className="tn-ticket-big num">#{t.ticketNo}</span>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span className="tn-ticket-label">{status === "done" ? "Status" : "Ahead of you"}</span>
                    <span className="tn-ticket-big num">{status === "done" ? "Done" : w ? w.brothersAhead : "–"}</span>
                  </span>
                </span>
                <span className="tn-ticket-line">{line}</span>
                <span className="tn-ticket-open">Open ticket</span>
              </a>
            );
          })}
          {note && <p className="tn-note"><strong>JP Chair:</strong> {note}</p>}
          <div className="tn-row">
            <button type="button" className="tn-btn-ghost press" onClick={() => onOpenSheet(me)}>Take another ticket</button>
            <button type="button" className="tn-btn-ghost press" onClick={() => onSeeFines(me)}>See my fines</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tn" id="tonight" aria-label="Next JP and tickets">
      <div className="container tn-inner">
        <span className="tn-pill">
          {opensAt ? <>Tickets open {opensAtLabel(opensAt)}</> : <><span className="tn-dot" aria-hidden="true" />Tickets open now</>}
        </span>
        {me ? <RememberedMe me={me} info={info} when={when} where={where} opensAt={opensAt} onOpenSheet={onOpenSheet} onForgetMe={onForgetMe} onSeeFines={onSeeFines} />
          : (
            <>
              <h1 className="tn-title">{when}</h1>
              {where && <p className="tn-where">{where}</p>}
              <div className="tn-card">
                <label htmlFor="tn-name" className="tn-label">Your name</label>
                <NamePicker id="tn-name" members={members} onPick={(m) => { onPickMe(m); if (!opensAt) onOpenSheet(m); }} />
                <TakeButton opensAt={opensAt} label="Take a ticket" onClick={() => onOpenSheet(null)} />
                <p className="tn-hint">Takes 20 seconds. The JP Chair calls or texts you when you&rsquo;re up, so you don&rsquo;t have to sit in the room.</p>
              </div>
              <button type="button" className="tn-link" onClick={() => onSeeFines(null)}>Just checking my fines</button>
            </>
          )}
      </div>
    </section>
  );
}

function RememberedMe({
  me,
  info,
  when,
  where,
  opensAt,
  onOpenSheet,
  onForgetMe,
  onSeeFines,
}: {
  me: MemberLite;
  info: JpInfo;
  when: string;
  where: string;
  opensAt: string | null;
  onOpenSheet: (m: MemberLite | null) => void;
  onForgetMe: () => void;
  onSeeFines: (m: MemberLite | null) => void;
}) {
  const [wait, setWait] = useState<{ id: string; w: JpWait } | null>(null);
  useEffect(() => {
    let stop = false;
    fetch(`/api/jp-wait/${me.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((w: JpWait | null) => { if (!stop && w) setWait({ id: me.id, w }); })
      .catch(() => {});
    return () => { stop = true; };
  }, [me.id]);
  const w = wait?.id === me.id ? wait.w : null;
  const first = firstName(me.name);
  const count = w?.onDocket ? w.ownFines.reduce((n, f) => n + f.count, 0) : 0;
  const startTime = info.sessionLive ? "" : info.nextSession?.time ?? "";

  return (
    <>
      <h1 className="tn-title">
        {!w ? `Hey ${first}` : w.onDocket ? `Hey ${first}, you’re on the docket` : `Hey ${first}, you’re clear`}
      </h1>
      <p className="tn-where">
        {!w
          ? [when, where].filter(Boolean).join(" · ")
          : w.onDocket
            ? `${count} fine${count !== 1 ? "s" : ""} to hear · ${when.replace("JP is ", "")} · ${likelyWhen(w, startTime, info.sessionLive)}`
            : "Nothing of yours is on the docket, so there’s no need to come."}
      </p>
      {(!w || w.onDocket) && (
        <div className="tn-card">
          <TakeButton opensAt={opensAt} label="Take my ticket" onClick={() => onOpenSheet(me)} />
          <p className="tn-hint">The JP Chair calls or texts you when you&rsquo;re up.</p>
        </div>
      )}
      <div className="tn-row tn-row-light">
        <button type="button" className="tn-link" onClick={() => onSeeFines(me)}>See my fines</button>
        <button type="button" className="tn-link" onClick={() => { haptic(); onForgetMe(); }}>Not {first}? Switch</button>
      </div>
    </>
  );
}

function TicketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z" />
      <line x1="14" y1="5" x2="14" y2="19" strokeDasharray="2 3" />
    </svg>
  );
}

// The Take a ticket sheet: who you are → (officers preselected) → how to reach you.
export function TicketSheet({
  open,
  onClose,
  info,
  members,
  member,
  onPickMe,
}: {
  open: boolean;
  onClose: () => void;
  info: JpInfo | null;
  members: MemberLite[];
  member: MemberLite | null;
  onPickMe: (m: MemberLite | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [wait, setWait] = useState<{ id: string; w: JpWait | null } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || !member) return;
    let stop = false;
    fetch(`/api/jp-wait/${member.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((w: JpWait | null) => { if (!stop) setWait({ id: member.id, w }); })
      .catch(() => { if (!stop) setWait({ id: member.id, w: null }); });
    return () => { stop = true; };
  }, [open, member]);

  const w = member && wait?.id === member.id ? wait.w : undefined;
  const startTime = info?.sessionLive ? "" : info?.nextSession?.time ?? "";

  return (
    <dialog
      ref={ref}
      className="tn-sheet"
      aria-labelledby="tn-sheet-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {open && (
        <div className="tn-sheet-body">
          <span className="tn-grab" aria-hidden="true" />
          <div className="tn-sheet-head">
            <h2 id="tn-sheet-title" className="tn-sheet-title">Take a ticket</h2>
            <button type="button" className="tn-close press" aria-label="Close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            </button>
          </div>

          <p className="tn-step">1 · Who are you</p>
          {member ? (
            <div className="tn-me">
              {member.roll != null && <span className="roll-badge num">{member.roll}</span>}
              <span className="tn-me-name">{member.name}</span>
              <button type="button" className="tn-change" onClick={() => onPickMe(null)}>Change</button>
            </div>
          ) : (
            <>
              <label htmlFor="tn-sheet-name" className="visually-hidden">Your name</label>
              <NamePicker id="tn-sheet-name" members={members} onPick={(m) => onPickMe(m)} autoFocus />
            </>
          )}

          {member && (
            w === undefined ? (
              <p className="tn-sheet-text" role="status">Checking the docket&hellip;</p>
            ) : w === null ? (
              <p className="jp-ticket-error" role="alert">Couldn&rsquo;t check the docket. Close this and try again.</p>
            ) : !w.onDocket ? (
              <p className="jp-ticket-done" role="status">You&rsquo;re clear, {firstName(member.name)}. Nothing of yours is on the docket, so there&rsquo;s no need for a ticket.</p>
            ) : (
              <>
                <p className="tn-sheet-text">
                  You&rsquo;re on the docket: <strong>{likelyWhen(w, startTime, !!info?.sessionLive)}</strong>.
                </p>
                <p className="tn-step">2 · Who fined you, and how to reach you</p>
                <TicketBox
                  key={member.id}
                  window={info?.tickets ?? { state: "none" }}
                  memberId={member.id}
                  officers={ticketOfficers(info?.recentOfficers ?? [], w.groups.map((g) => g.officer))}
                  defaultPicked={w.groups.map((g) => g.officer)}
                  startOpen
                />
                <p className="tn-sheet-small">Your place is by roll # within each officer&rsquo;s group, not by ticket #.</p>
              </>
            )
          )}
        </div>
      )}
    </dialog>
  );
}
