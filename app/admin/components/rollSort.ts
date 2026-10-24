import type { Member } from "@/lib/types";

export type FineSort = "newest" | "roll";

// member_id → roll #, for sorting and labelling fines by roll.
export function rollMap(members: Member[]): Map<string, number | null> {
  return new Map(members.map((m) => [m.id, m.roll ?? null]));
}

// Lowest roll # first; members without a roll go last. Array.sort is stable, so fines
// for the same brother keep their incoming (newest-first) order.
export function sortByRoll<T extends { member_id: string }>(items: T[], rolls: Map<string, number | null>): T[] {
  return [...items].sort((a, b) => {
    const ra = rolls.get(a.member_id) ?? null;
    const rb = rolls.get(b.member_id) ?? null;
    if (ra === rb) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb;
  });
}
