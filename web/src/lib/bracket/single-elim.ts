import { seedOrder } from "@/lib/bracket/seed-order";
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";

/** Smallest power of 2 >= n. nextPow2(1) = 1. */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generate a single-elimination bracket for the given participants.
 *
 * - Input is sorted by `seed` ascending (caller order is not trusted).
 * - The bracket size is the smallest power of 2 >= N; the difference is
 *   filled with byes that auto-advance the top seeds.
 * - Round 1 pairings follow the standard `seedOrder(size)`.
 * - Each non-final match links to its parent via `nextRef`
 *   (round+1, floor(slot/2), side "a" if slot even else "b").
 *
 * For N <= 1 there is nothing to play, so an empty array is returned.
 */
export function generateSingleElim(
  participants: SeededParticipant[],
): GeneratedMatch[] {
  const sorted = [...participants].sort((a, b) => a.seed - b.seed);
  const n = sorted.length;
  if (n <= 1) return [];

  const size = nextPow2(n);
  const rounds = Math.log2(size);

  // Map seed (1..N) -> participant id. Seeds > N represent byes (no entrant).
  const idBySeed = new Map<number, string>();
  for (const p of sorted) idBySeed.set(p.seed, p.id);
  const resolve = (seed: number): string | null => idBySeed.get(seed) ?? null;

  const order = seedOrder(size);
  const matches: GeneratedMatch[] = [];

  const nextRefFor = (
    round: number,
    slot: number,
  ): GeneratedMatch["nextRef"] => {
    if (round >= rounds) return null;
    return {
      round: round + 1,
      slot: Math.floor(slot / 2),
      side: slot % 2 === 0 ? "a" : "b",
    };
  };

  // Round 1: resolve seeded pairings into real matches / byes.
  const half = size / 2;
  for (let i = 0; i < half; i++) {
    const aId = resolve(order[2 * i]);
    const bId = resolve(order[2 * i + 1]);

    let status: GeneratedMatch["status"];
    let winnerId: string | null;
    if (aId !== null && bId !== null) {
      status = "pending";
      winnerId = null;
    } else if (aId !== null || bId !== null) {
      // exactly one present -> bye, present participant auto-advances
      status = "bye";
      winnerId = aId ?? bId;
    } else {
      // both null cannot occur when byes <= size/2 (always true here),
      // but guard anyway so the slot stays a well-formed pending match.
      status = "pending";
      winnerId = null;
    }

    matches.push({
      round: 1,
      slot: i,
      participantAId: aId,
      participantBId: bId,
      winnerId,
      status,
      nextRef: nextRefFor(1, i),
    });
  }

  // Rounds 2..log2(size): empty pending matches awaiting advancement.
  for (let r = 2; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let slot = 0; slot < count; slot++) {
      matches.push({
        round: r,
        slot,
        participantAId: null,
        participantBId: null,
        winnerId: null,
        status: "pending",
        nextRef: nextRefFor(r, slot),
      });
    }
  }

  return matches;
}
