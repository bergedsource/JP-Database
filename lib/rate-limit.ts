// Simple in-memory rate limiter. Per-instance (Vercel serverless), so limits
// are per function cold-start — appropriate for this scale. For stricter
// limits, replace with an Upstash Redis-backed limiter.
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  maxRequests: number; // max requests per window
  windowMs: number;   // window size in milliseconds
}

/**
 * Returns true if the request should be blocked (limit exceeded).
 * key is typically the IP address.
 */
export function isRateLimited(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return false;
  }

  entry.count += 1;
  if (entry.count > opts.maxRequests) return true;
  return false;
}

/**
 * Extract IP from a Next.js request.
 * Falls back to "unknown" if no IP is available.
 */
export function getIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
