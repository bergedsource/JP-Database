# JP Ticket Queue — Design

**Date:** 2026-10-24
**Status:** Planned, not started
**Feature:** "Take a ticket" for JP sessions, so brothers can wait in their rooms and get called when they're up.

---

## Problem

At JP sessions brothers wait in a long line in the hallway. Sessions run long, people get frustrated, and some leave before they're heard. Then their fines get decided without them, or they come back angry.

## Goal

A brother with a fine on the docket can **take a ticket** from his phone. The ticket gives the JP Chair his **roll #, name and phone number**. He goes back to his room, watches his place in line on his phone, and the chair calls or texts him when he's close.

## Non-goals (phase 1)

- Automatic texts from the site. Phase 1 uses the chair's own phone through `tel:` / `sms:` links. Automated SMS comes in phase 3; see why under Phase 3.
- Tickets for brothers with nothing on the docket.
- Changing the order of hearings. Roll # low to high stays the rule.
- Member accounts or logins.

---

## How it works

### Brother's side (member homepage)

1. Brother searches his name (as today). The JP card's **"Your wait at JP"** panel (PR #20) already shows his place and estimated wait.
2. If a session is **open** (started, not closed), that panel shows a **Take a ticket** button.
   - When no session is open but a next session is posted for **today**, the button reads "Get in line for tonight". Those tickets attach to the session when it starts.
3. He enters his **phone number** and taps **Take ticket**. Name and roll # come from the search, so he doesn't type them. A consent line under the field says: "The JP Chair will use this number to call or text you when you're up. It's deleted when the session ends."
4. He gets a **ticket screen** (`/ticket/[token]`). Saving it to the home screen helps, but it also works as a normal tab. It shows:
   - ticket number and his name / roll #
   - **Now hearing:** roll #NN
   - **Your place:** 3rd in line, with about 10–15 min left, recalculated live as fines get decided
   - status: Waiting → **You're up next** (gold banner) → **Called** → **Done**
   - **Cancel ticket** and "I'm here" buttons
5. The page refreshes every 15 s. When he becomes next, it plays a short sound and asks for browser notification permission, so it can still ping him if the tab is in the background.
6. His ticket link is kept on his phone (localStorage), so reopening the homepage takes him straight back to it.

### Chair's side (admin → Sessions → open session)

A **Queue** panel sits beside the docket (above it on phones):

| Roll # | Brother | Fines | Ticket | Phone | Actions |
|---|---|---|---|---|---|
| 8 | Ben Ortiz | 2 | #4 · waiting | (541) … | **Call** · **Text** · **Mark here** · **Skip** |
| 12 | Cal Reyes | 2 | — no ticket | — | |
| 15 | Marcus Ellery | 2 | #2 · *up next* | (541) … | … |

- The list follows **docket order (roll # low to high)**. It shows every brother with a pending fine, with his ticket status if he has one.
- **Call** opens `tel:+1541…`. **Text** opens `sms:+1541…?body=` with a ready message:
  > "JP: you're up in about 5 min. Head to the chapter room. – JP Chair"
- **Call next** button: marks the next ticket holder in roll order as *called*, which flips his ticket screen to "You're up". It then offers Call/Text for him.
- **Mark here** turns his row green.
- **Skip / no-show** keeps him in the list but moves the call pointer past him. He can still be heard later.
- Deciding all of a brother's fines (the existing decision buttons) marks his ticket **Done** automatically.
- A header line: "6 tickets · 2 waiting · now hearing roll #12".

### Order rule

Hearings stay in **roll # order**. A ticket doesn't let anyone jump the line; it only lets him wait somewhere else. If the brother whose turn it is isn't there, the chair skips to the next brother who is present or has a ticket. The skipped brother gets "called" again when he shows up.

---

## Data model

New migration: `supabase/migrations/migration_add_jp_tickets.sql`

```sql
create table public.jp_tickets (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references public.jp_sessions(id) on delete cascade,  -- null = pre-session ("tonight") ticket
  session_date  date not null,              -- the posted/started session date this ticket is for
  member_id     uuid not null references public.members(id) on delete cascade,
  ticket_no     int  not null,              -- 1, 2, 3… per session_date, in order taken
  phone         text not null,              -- E.164, e.g. +15415551234
  token_hash    text not null,              -- sha256 of the secret in the ticket link
  status        text not null default 'waiting'
                check (status in ('waiting','here','called','done','skipped','cancelled')),
  created_at    timestamptz not null default now(),
  called_at     timestamptz,
  done_at       timestamptz,
  unique (session_date, member_id)          -- one ticket per brother per night
);
create index jp_tickets_session_idx on public.jp_tickets(session_date, status);

alter table public.jp_tickets enable row level security;
-- No policies: only the service role (server routes) can read or write.
-- Phone numbers must never be reachable from the browser or a public view.
```

- **Phone numbers are personal data.** They're never in a public view, never returned by a public route, and only shown on the admin Queue panel to owner/root.
- **Auto-delete:** closing a session nulls out `phone` (or deletes the tickets) for that session. A daily cron run also deletes any ticket more than 24 h old. The existing Jan 4 wipe also deletes the table's rows.

---

## API

### Public (rate-limited with `publicLimiter`)

| Method | Route | Does |
|---|---|---|
| `POST` | `/api/jp-ticket` | `{ member_id, phone }`. Validates that a session is open (or one is posted for today), the member has a pending fine, and he has no ticket yet. Normalizes the phone to E.164 (US numbers). Creates the ticket and returns `{ token, ticket_no }`. The token is returned **once**; only its hash is stored. |
| `GET` | `/api/jp-ticket/[token]` | The ticket screen's data: name, roll, ticket #, status, place in line, est. minutes, "now hearing" roll #. **Never returns the phone number** or any other brother's name. |
| `POST` | `/api/jp-ticket/[token]/here` | Brother taps "I'm here". |
| `DELETE` | `/api/jp-ticket/[token]` | Brother cancels. |

### Admin (`requireOwner()` first line; `adminLimiter` on writes; audit-logged)

| Method | Route | Does |
|---|---|---|
| `GET` | `/api/admin/sessions/[id]/queue` | Docket brothers in roll order, with ticket status + phone. |
| `POST` | `/api/admin/sessions/[id]/queue/call-next` | Marks the next waiting/here ticket holder as `called`. |
| `PATCH` | `/api/admin/tickets/[ticketId]` | Set status to here / skipped / done / waiting. |

- **Starting a session** (existing `POST /api/admin/sessions`) attaches that day's pre-session tickets (`session_date = date_held`, `session_id` null) to the new session.
- **Closing a session** clears phone numbers for its tickets.

### Live wait math

This reuses `lib/jp-info.ts` (`brotherMinutes`, `waitRange`). During an open session, the minutes ahead of a brother only count the **undecided** fines of brothers ahead of him who haven't been skipped. That keeps the estimate shrinking as the night goes on. "Now hearing" is the lowest roll # that still has an undecided fine and isn't skipped.

---

## Abuse and safety

The homepage has no logins, so anyone could take a ticket in someone else's name.

- **One ticket per brother per night.** A second attempt shows "You already have a ticket. Ask the JP Chair if you lost the link."
- Tickets only exist while a session is open, or one is posted for today. Only brothers with a pending fine can take one.
- The chair sees every ticket and can cancel one. A fake ticket gets exposed the first time the chair calls the number.
- Rate limiting is on all routes, and phone format is checked server-side.
- Optional (phase 2): the chair shows a **4-digit session code** at the meeting, either on the projector or said out loud. Taking a ticket requires it, which keeps it to people at or near the house.

---

## Phases

**Phase 1 — core (recommended first build)**
- `jp_tickets` table + migration
- Take-a-ticket form in the homepage JP card
- `/ticket/[token]` page with 15 s polling, "up next" banner and sound
- Admin Queue panel with Call / Text (`tel:` / `sms:`), Call next, Mark here, Skip
- Auto-done when a brother's fines are all decided; phone numbers cleared on session close

**Phase 2 — polish**
- Browser notifications on the ticket page
- Session check-in code
- "Running late" broadcast: the chair bumps everyone's estimate by N minutes
- Queue stats after the session (average wait, no-shows), saved for tuning the hearing-time tiers

**Phase 3 — automatic texts (optional, costs money)**
- Twilio (about $0.01 per text plus about $1/mo for a number). Texts go out automatically at "2 away" and "you're up".
- Sending from a US 10-digit number requires **A2P 10DLC registration** (brand + campaign, about $20 one-time plus small monthly fees, and a few days for approval). The consent line on the ticket form already covers opt-in. Add "Reply STOP to opt out".
- Needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` in Vercel, plus a server route that sends texts and logs each send.

---

## Screens to mock up first

When work starts, do a quick design canvas (same as the admin redesign and JP card) with:
1. Homepage JP card → "Take a ticket" form (phone field + consent line)
2. Ticket page on a phone: waiting, up next, called, done
3. Admin session screen with the Queue panel, desktop and phone

Use the existing look: homepage palette/fonts for member screens, admin palette for the Queue.

---

## Open questions for Dillon

1. When an absent brother is skipped and comes back, does he go **right after the current brother**, or **back to his roll # spot** if it's still ahead?
2. Should "Take a ticket" open only once the session is started, or earlier that day (pre-session tickets)? Pre-session needs the posted next-session date to be accurate.
3. Is a **check-in code** needed in phase 1, or is "the chair can cancel fake tickets" enough to start?
4. Should the text message wording be editable in admin settings, or fixed?
5. Is phase 3 (automatic texts, ~$20 setup plus a few dollars a month) worth it, or are tap-to-call and tap-to-text links enough?

---

## Files (expected)

| File | Action |
|---|---|
| `supabase/migrations/migration_add_jp_tickets.sql` | Create |
| `lib/jp-info.ts` | Add live-wait helper (undecided fines only) |
| `app/api/jp-ticket/route.ts` | Create (POST) |
| `app/api/jp-ticket/[token]/route.ts` | Create (GET, DELETE) |
| `app/api/jp-ticket/[token]/here/route.ts` | Create |
| `app/api/admin/sessions/[id]/queue/route.ts` | Create (GET) |
| `app/api/admin/sessions/[id]/queue/call-next/route.ts` | Create |
| `app/api/admin/tickets/[ticketId]/route.ts` | Create (PATCH) |
| `app/api/admin/sessions/route.ts` | Attach pre-session tickets on start |
| `app/api/admin/sessions/[id]/close/route.ts` | Clear phone numbers on close |
| `app/api/admin/sessions/[id]/update-fine/route.ts` | Mark ticket done when a brother's fines are all decided |
| `app/api/cron/route.ts` | Daily: delete tickets > 24 h old; Jan 4: wipe table |
| `app/JpInfoCard.tsx` | Take-a-ticket form + "View my ticket" link |
| `app/ticket/[token]/page.tsx` | Create (ticket screen) |
| `app/admin/components/SessionQueue.tsx` | Create (Queue panel) |
| `app/admin/components/SessionsTab.tsx` | Mount the Queue panel in the session detail view |
