/** Order-independent key for the unordered pair {a,b}. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Standard Swiss round count: ceil(log2(N)), at least 1 for N>=2, else 0. */
export function swissRoundCount(n: number): number {
  if (n < 2) return 0;
  return Math.max(1, Math.ceil(Math.log2(n)));
}

export interface SwissPairing {
  /** Ordered [higher-ranked, lower-ranked] pairs for the next round. */
  pairings: Array<[string, string]>;
  /** The player receiving a bye this round, or null when N is even. */
  bye: string | null;
}

/**
 * Compute one Swiss round's pairings from a ranked list (best first).
 *
 * - Odd count: the LOWEST-ranked player who has not had a bye yet receives one
 *   (searched bottom-up; if everyone already had a bye, the very last player).
 * - Pairing is greedy from the top: each still-unpaired player is matched to the
 *   next unpaired player below them whom they have NOT already played; if every
 *   remaining opponent is a rematch, the closest one is used (rematch fallback).
 *
 * `played` holds `pairKey` of every pairing already contested; `byeHistory`
 * holds every player who has already had a bye.
 */
export function pairSwissRound(
  ranked: string[],
  played: Set<string>,
  byeHistory: Set<string>,
): SwissPairing {
  const pool = [...ranked];
  let bye: string | null = null;

  if (pool.length % 2 === 1) {
    let byeIdx = pool.length - 1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!byeHistory.has(pool[i])) {
        byeIdx = i;
        break;
      }
    }
    bye = pool[byeIdx];
    pool.splice(byeIdx, 1);
  }

  const pairings: Array<[string, string]> = [];
  const used = new Array<boolean>(pool.length).fill(false);

  for (let i = 0; i < pool.length; i++) {
    if (used[i]) continue;
    used[i] = true;

    let oppIdx = -1;
    let fallbackIdx = -1;
    for (let j = i + 1; j < pool.length; j++) {
      if (used[j]) continue;
      if (fallbackIdx === -1) fallbackIdx = j;
      if (!played.has(pairKey(pool[i], pool[j]))) {
        oppIdx = j;
        break;
      }
    }

    const chosen = oppIdx !== -1 ? oppIdx : fallbackIdx;
    if (chosen === -1) break; // even pool guarantees this never trips
    used[chosen] = true;
    pairings.push([pool[i], pool[chosen]]);
  }

  return { pairings, bye };
}
