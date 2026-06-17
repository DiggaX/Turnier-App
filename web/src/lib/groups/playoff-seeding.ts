import type { SeededParticipant } from "@/lib/bracket/types";

/**
 * Build the seeded advancer list for the playoff from per-group ranked
 * standings (each inner array is one group's participant ids, best first).
 *
 * Order: all rank-1 finishers in group order, then rank-2 in REVERSE group
 * order, then rank-3 in group order, … up to `advancePerGroup` ranks. Reversing
 * alternate ranks keeps a group's winner and runner-up on opposite ends of the
 * bracket. Each advancer gets `seed = index + 1`. Groups that lack a finisher at
 * a given rank are simply skipped for that rank.
 */
export function seedPlayoffAdvancers(
  rankedByGroup: string[][],
  advancePerGroup: number,
): SeededParticipant[] {
  const ids: string[] = [];
  for (let rank = 0; rank < advancePerGroup; rank++) {
    const order =
      rank % 2 === 0
        ? rankedByGroup
        : [...rankedByGroup].reverse();
    for (const group of order) {
      if (group[rank] !== undefined) ids.push(group[rank]);
    }
  }
  return ids.map((id, i) => ({ id, seed: i + 1 }));
}
