import { nextPow2 } from "@/lib/bracket/single-elim";
import { seedOrder } from "@/lib/bracket/seed-order";
import type {
  GeneratedMatch,
  MatchRef,
  SeededParticipant,
} from "@/lib/bracket/types";

/**
 * Generate a pure double-elimination bracket for a power-of-two entrant count.
 *
 * Structure (single grand-final, no bracket reset):
 *   - Winner Bracket (WB): the seeded single-elim over N players, `k = log2(N)`
 *     rounds. Winners advance via `nextRef`; the WB final winner goes to the GF
 *     (side a). Every WB match's LOSER drops into the Loser Bracket via
 *     `loserRef`.
 *   - Loser Bracket (LB): `2*(k-1)` rounds, alternating "minor" rounds (LB
 *     survivors play each other) and "major" rounds (LB survivors meet the
 *     freshly-dropped WB losers of the matching WB round). LB losers are
 *     eliminated; the LB final winner goes to the GF (side b).
 *   - Grand Final (GF): one match fed by the WB-final winner (side a) and the
 *     LB-final winner (side b).
 *
 * LB round layout (1-based), for `j` counting WB rounds 2..k as `i = j + 1`:
 *   - LB round 1            — minor: pairs of WB-R1 losers           (N/4 matches)
 *   - LB round 2j (j=1..k-1) — major: LB-(2j-1) winners vs WB-(j+1)  (N/2^(j+1))
 *   - LB round 2j+1 (j=1..k-2) — minor: LB-2j winners pair up        (N/2^(j+2))
 *
 * Empty match slots (participants filled later by upstream `nextRef`/`loserRef`)
 * are emitted as `pending`. Since N is a power of two there are no byes.
 *
 * `round` is 1-based within each bracket; `slot` is 0-based within
 * `(bracket, round)`.
 *
 * @throws if N is not a power of two >= 2.
 */
export function generateDoubleElim(
  participants: SeededParticipant[],
): GeneratedMatch[] {
  const sorted = [...participants].sort((a, b) => a.seed - b.seed);
  const n = sorted.length;

  if (n < 2 || nextPow2(n) !== n) {
    throw new Error(
      "double elimination requires a power-of-two entrant count",
    );
  }

  const k = Math.log2(n); // WB rounds
  const lbRounds = 2 * (k - 1); // LB rounds

  const idBySeed = new Map<number, string>();
  for (const p of sorted) idBySeed.set(p.seed, p.id);
  const order = seedOrder(n);

  const matches: GeneratedMatch[] = [];

  // ── Winner Bracket ──────────────────────────────────────────────────────
  // Where a WB match's LOSER drops in the LB. WB round 1 feeds LB round 1
  // (minor, pairing); WB round i (>=2) feeds the matching major LB round
  // (round 2*(i-1)) on side "b".
  const wbLoserRef = (round: number, slot: number): MatchRef => {
    if (round === 1) {
      return {
        bracket: "loser",
        round: 1,
        slot: Math.floor(slot / 2),
        side: slot % 2 === 0 ? "a" : "b",
      };
    }
    // round i >= 2 -> major LB round 2*(i-1), one-to-one slot, side "b".
    return {
      bracket: "loser",
      round: 2 * (round - 1),
      slot,
      side: "b",
    };
  };

  // Where a WB match's WINNER advances. Final winner -> GF side a.
  const wbWinnerRef = (round: number, slot: number): MatchRef => {
    if (round >= k) {
      return { bracket: "grand_final", round: 1, slot: 0, side: "a" };
    }
    return {
      bracket: "winner",
      round: round + 1,
      slot: Math.floor(slot / 2),
      side: slot % 2 === 0 ? "a" : "b",
    };
  };

  // WB round 1: seeded pairings (no byes, N is a power of two).
  const wbR1 = n / 2;
  for (let s = 0; s < wbR1; s++) {
    const aId = idBySeed.get(order[2 * s]) ?? null;
    const bId = idBySeed.get(order[2 * s + 1]) ?? null;
    matches.push({
      bracket: "winner",
      round: 1,
      slot: s,
      participantAId: aId,
      participantBId: bId,
      winnerId: null,
      status: "pending",
      nextRef: wbWinnerRef(1, s),
      loserRef: wbLoserRef(1, s),
    });
  }
  // WB rounds 2..k: empty pending matches awaiting advancement.
  for (let r = 2; r <= k; r++) {
    const count = n / 2 ** r;
    for (let s = 0; s < count; s++) {
      matches.push({
        bracket: "winner",
        round: r,
        slot: s,
        participantAId: null,
        participantBId: null,
        winnerId: null,
        status: "pending",
        nextRef: wbWinnerRef(r, s),
        loserRef: wbLoserRef(r, s),
      });
    }
  }

  // ── Loser Bracket ───────────────────────────────────────────────────────
  // Number of matches in LB round r.
  const lbCount = (r: number): number => {
    if (r === 1) return n / 4;
    if (r % 2 === 0) {
      // major round 2j -> N / 2^(j+1)
      const j = r / 2;
      return n / 2 ** (j + 1);
    }
    // minor round 2j+1 -> N / 2^(j+2)
    const j = (r - 1) / 2;
    return n / 2 ** (j + 2);
  };

  // Where an LB match's WINNER advances. LB final winner -> GF side b.
  const lbWinnerRef = (round: number): ((slot: number) => MatchRef) => {
    if (round >= lbRounds) {
      return () => ({ bracket: "grand_final", round: 1, slot: 0, side: "b" });
    }
    const nextRound = round + 1;
    if (nextRound % 2 === 0) {
      // next is a major round: LB winners move forward 1:1 onto side "a"
      // (the freshly-dropped WB loser takes side "b").
      return (slot) => ({
        bracket: "loser",
        round: nextRound,
        slot,
        side: "a",
      });
    }
    // next is a minor round: major-round winners pair up.
    return (slot) => ({
      bracket: "loser",
      round: nextRound,
      slot: Math.floor(slot / 2),
      side: slot % 2 === 0 ? "a" : "b",
    });
  };

  for (let r = 1; r <= lbRounds; r++) {
    const count = lbCount(r);
    const winnerRefFor = lbWinnerRef(r);
    for (let s = 0; s < count; s++) {
      matches.push({
        bracket: "loser",
        round: r,
        slot: s,
        participantAId: null,
        participantBId: null,
        winnerId: null,
        status: "pending",
        nextRef: winnerRefFor(s),
        loserRef: null, // LB losers are eliminated
      });
    }
  }

  // ── Grand Final ─────────────────────────────────────────────────────────
  matches.push({
    bracket: "grand_final",
    round: 1,
    slot: 0,
    participantAId: null,
    participantBId: null,
    winnerId: null,
    status: "pending",
    nextRef: null,
    loserRef: null,
  });

  return matches;
}
