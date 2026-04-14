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
 * Extract IP from a Next.js request.
 * x-real-ip is set by Vercel's edge and cannot be spoofed by clients.
 */
export function getIP(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}
