@AGENTS.md

# Acacia JP Fine Tracker

## Stack
Next.js (App Router) + TypeScript + Tailwind + Supabase + Vercel

## Architecture
- **Public page** (`app/page.tsx`): member name search + fine lookup, no auth required
- **Admin dashboard** (`app/admin/`): tabbed interface, requires Supabase session
- **API routes** (`app/api/`): all state mutations go through server-side route handlers
- **Middleware** (`proxy.ts`): blocks unauthenticated access to `/admin/*` and `/api/admin/*` at the edge

## Auth Model
Three layers — all three must hold:
1. **Middleware** (`proxy.ts`): rejects unauthenticated requests before routes execute
2. **Route-level guard**: every write route calls `requireOwner()` or `requireAuth()` as its first line
3. **Service client**: all DB writes use `createServiceClient()` (service role, bypasses RLS)

### Roles
- `admin` — read-only plus editing amounts on fines they created
- `owner` — full write access (create/delete fines, members, sessions, users)
- `root` — creator account; logs to `system_events` instead of `audit_logs`; cannot transfer ownership

### Supabase clients
- `lib/supabase/client.ts` — browser client (anon key, use in client components)
- `lib/supabase/server.ts` — SSR client (anon key + cookies, use in server components/pages)
- `lib/supabase/service.ts` — service role client; **server-only, never expose to browser**

## Key Invariants
- **Never** use `createServiceClient()` in a public/unauthenticated route
- All state-changing admin routes must call `requireOwner()` as the **first line**
- The `notes` field must **never** appear in `/api/member-fines/` responses
- Rate-limit all public endpoints with `publicLimiter`; destructive admin endpoints with `adminLimiter`
- All write operations must insert an audit log entry (`audit_logs` or `system_events` for root)

## Cron (`app/api/cron/route.ts`)
Authenticated via `CRON_SECRET` bearer token (set in Vercel Cron config).

Scheduled jobs:
- **Jan 3**: warning email to owners — fines will be deleted tomorrow
- **Jan 4**: annual deletion of all fines, JP sessions, auto soc-pro entries
  - Aborts if fine count is 0 (safety guard against double-fire or misconfiguration)
- **Term rollover dates** (Jan 5, Apr 1, Jul 1, Sep 1): reminder emails
- **Daily**: auto-escalate pending fines >2 weeks old → `upheld`; auto-manage social probation

## Rate Limiting (`lib/rate-limit.ts`)
- `publicLimiter` — 30 req/min per IP, applied to all public endpoints
- `exportLimiter` — 20 req/min per IP, applied to bulk export
- `adminLimiter` — 60 req/min per IP, applied to destructive admin endpoints
- IP extracted from `x-real-ip` (Vercel edge — cannot be client-spoofed in production)

## Known Issues / Tech Debt
- RLS on `fines` table still allows public anon reads directly via Supabase REST API,
  bypassing rate limiting. Fix: drop `Public can read fines` policy; switch
  `/api/member-fines/[id]` to use `createServiceClient()`.
- `requireOwner()` + `getCurrentRole()` called back-to-back in several routes (2 DB round-trips).
  Could be refactored to return role data from `requireOwner()` directly.
- `fines/[id]/amount` route uses manual role check instead of `requireOwner()` — intentional
  (allows admins to edit amounts on fines they created) but inconsistent with other routes.
