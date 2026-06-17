import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";

/**
 * Generate a round-robin schedule (every participant plays every other once)
 * using the circle method.
 *
 * - If N is odd, a sentinel `null` slot is added so the slot count is even;
 *   any pairing that involves the sentinel is skipped (that participant has a
 *   bye that matchday and is simply not scheduled).
 * - Rounds: `N` when padded (odd N), `N - 1` when even.
 * - Each round fixes the first slot and rotates the rest; slot `k` plays slot
 *   `size - 1 - k`.
 * - Every emitted match is `pending` with no winner and no `nextRef`.
 *   `round` is the 1-based matchday, `slot` is the 0-based index within that
 *   matchday's emitted matches.
 */
export function generateRoundRobin(
  participants: SeededParticipant[],
): GeneratedMatch[] {
  const ids = [...participants]
    .sort((a, b) => a.seed - b.seed)
    .map((p) => p.id);
  const n = ids.length;
  if (n < 2) return [];

  const padded = n % 2 === 1;
  // slots: real ids plus a sentinel (null) when N is odd
  const slots: (string | null)[] = padded ? [...ids, null] : [...ids];
  const size = slots.length;
  const rounds = padded ? n : n - 1;

  const matches: GeneratedMatch[] = [];

  for (let round = 1; round <= rounds; round++) {
    let slot = 0;
    for (let k = 0; k < size / 2; k++) {
      const a = slots[k];
      const b = slots[size - 1 - k];
      // skip pairings that involve the padding sentinel
      if (a !== null && b !== null) {
        matches.push({
          round,
          slot,
          participantAId: a,
          participantBId: b,
          winnerId: null,
          status: "pending",
          nextRef: null,
        });
        slot++;
      }
    }

    // rotate: keep slots[0] fixed, move the rest clockwise by one
    // (the moved value may be the padding sentinel, which is fine)
    if (size > 2) {
      const last = slots[size - 1];
      for (let i = size - 1; i > 1; i--) {
        slots[i] = slots[i - 1];
      }
      slots[1] = last;
    }
  }

  return matches;
}
