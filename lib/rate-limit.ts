import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Public endpoints — member search, fine lookup
export const publicLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "rl:public",
});

// Admin export endpoint
export const exportLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "rl:export",
});

// Admin write endpoints — per-IP cap on destructive operations
export const adminLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "rl:admin",
});

/**
 * Returns true if the request should be blocked (limit exceeded).
 * Pass a Ratelimit instance and an IP string.
 */
export async function isRateLimited(
  limiter: Ratelimit,
  ip: string
): Promise<boolean> {
  const { success } = await limiter.limit(ip);
  return !success;
}

/**
 * Extract the client IP used as the rate-limit key.
 *
 * On Vercel, `x-real-ip` is set by the edge and cannot be spoofed by clients, so
 * it is the only header we trust in production. `x-forwarded-for` is fully
 * client-controlled — trusting it would let an attacker rotate the header to get
 * a fresh limiter bucket per request and defeat rate limiting entirely — so it
 * is used ONLY off-Vercel (local dev, where `x-real-ip` isn't set). In
 * production, a missing `x-real-ip` collapses to a single shared bucket rather
 * than trusting the forwarded chain.
 */
export function getIP(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // Behind the Vercel edge x-real-ip is always present; its absence here means
  // we're not behind a trusted proxy, so never trust the client-set chain.
  if (process.env.VERCEL) return "no-real-ip";

  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
