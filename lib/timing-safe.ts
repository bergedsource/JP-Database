import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets (bearer tokens, API keys).
 *
 * A plain `a === b` / `a !== b` short-circuits on the first differing byte, so
 * response timing leaks how much of a guessed secret is correct. This compares
 * in time independent of the contents. The length check is not itself sensitive
 * (token lengths are fixed and public) and only guards timingSafeEqual, which
 * throws on unequal-length buffers.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
