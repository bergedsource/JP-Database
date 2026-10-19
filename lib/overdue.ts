import type { Fine } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_WINDOW_DAYS = 14;
export const EXTENSION_DAYS = 7;

// When a pending fine needs a decision: an explicit extension, else 2 weeks after it was created.
export function reviewDeadline(fine: Pick<Fine, "created_at" | "review_deadline">): Date {
  if (fine.review_deadline) return new Date(fine.review_deadline);
  return new Date(new Date(fine.created_at).getTime() + REVIEW_WINDOW_DAYS * DAY_MS);
}

export function isOverdue(fine: Fine, now: number): boolean {
  return fine.status === "pending" && reviewDeadline(fine).getTime() < now;
}

export function daysOverdue(fine: Fine, now: number): number {
  return Math.max(1, Math.floor((now - reviewDeadline(fine).getTime()) / DAY_MS));
}
