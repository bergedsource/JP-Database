import type { Member } from "@/lib/types";

export type FineSort = "newest" | "roll" | "roll-desc";

// member_id → roll #, for sorting and labelling fines by roll.
export function rollMap(members: Member[]): Map<string, number | null> {
  return new Map(members.map((m) => [m.id, m.roll ?? null]));
}

// Orders by roll # ("roll" = low to high, "roll-desc" = high to low); any other sort
// leaves the incoming order alone. Members without a roll go last either way.
// Array.sort is stable, so fines for the same brother keep their incoming order.
export function sortFines<T extends { member_id: string }>(items: T[], sort: FineSort, rolls: Map<string, number | null>): T[] {
  if (sort !== "roll" && sort !== "roll-desc") return items;
  const dir = sort === "roll" ? 1 : -1;
  return [...items].sort((a, b) => {
    const ra = rolls.get(a.member_id) ?? null;
    const rb = rolls.get(b.member_id) ?? null;
    if (ra === rb) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return (ra - rb) * dir;
  });
}
