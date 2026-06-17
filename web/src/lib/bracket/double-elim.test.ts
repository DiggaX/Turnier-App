import { describe, it, expect } from "vitest";

import { generateDoubleElim } from "@/lib/bracket/double-elim";
import { seedOrder } from "@/lib/bracket/seed-order";
import type {
  Bracket,
  GeneratedMatch,
  MatchRef,
  SeededParticipant,
} from "@/lib/bracket/types";

/** Build participants p1..pN with seeds 1..N (reversed to prove sorting). */
function participants(n: number): SeededParticipant[] {
  const list: SeededParticipant[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    seed: i + 1,
  }));
  return [...list].reverse();
}

/** Key a match / ref by its full (bracket, round, slot) coordinate. */
function key(bracket: Bracket, round: number, slot: number): string {
  return `${bracket}:${round}:${slot}`;
}

/** Index matches by (bracket, round, slot); every coordinate must be unique. */
function indexMatches(matches: GeneratedMatch[]): Map<string, GeneratedMatch> {
  const map = new Map<string, GeneratedMatch>();
  for (const m of matches) {
    const k = key(m.bracket, m.round, m.slot);
    expect(map.has(k)).toBe(false); // no duplicate coordinates
    map.set(k, m);
  }
  return map;
}

function refKey(ref: MatchRef): string {
  return key(ref.bracket, ref.round, ref.slot);
}

/** Count matches per LB round, in round order (1..maxRound). */
function lbRoundCounts(matches: GeneratedMatch[]): number[] {
  const counts = new Map<number, number>();
  for (const m of matches) {
    if (m.bracket !== "loser") continue;
    counts.set(m.round, (counts.get(m.round) ?? 0) + 1);
  }
  const maxRound = Math.max(...counts.keys());
  return Array.from({ length: maxRound }, (_, i) => counts.get(i + 1) ?? 0);
}

/**
 * Validate every nextRef/loserRef resolves to an existing match, and no
 * (bracket, round, slot, side) target is claimed twice.
 */
function assertRefsResolve(matches: GeneratedMatch[]) {
  const index = indexMatches(matches);
  const claimedSides = new Set<string>();
  for (const m of matches) {
    for (const ref of [m.nextRef, m.loserRef]) {
      if (!ref) continue;
      const k = refKey(ref);
      expect(index.has(k)).toBe(true); // target exists
      const sideKey = `${k}:${ref.side}`;
      expect(claimedSides.has(sideKey)).toBe(false); // side not double-claimed
      claimedSides.add(sideKey);
    }
  }
}

describe("generateDoubleElim", () => {
  describe("non-power-of-two entrant counts throw", () => {
    for (const n of [3, 5, 6]) {
      it(`N=${n} throws`, () => {
        expect(() => generateDoubleElim(participants(n))).toThrow(
          "double elimination requires a power-of-two entrant count",
        );
      });
    }
  });

  describe("N=4 explicit fixture", () => {
    const matches = generateDoubleElim(participants(4));
    const index = indexMatches(matches);
    const at = (b: Bracket, r: number, s: number) =>
      index.get(key(b, r, s))!;

    it("has 6 matches: WB 3 + LB 2 + GF 1", () => {
      expect(matches).toHaveLength(6);
      expect(matches.filter((m) => m.bracket === "winner")).toHaveLength(3);
      expect(matches.filter((m) => m.bracket === "loser")).toHaveLength(2);
      expect(
        matches.filter((m) => m.bracket === "grand_final"),
      ).toHaveLength(1);
    });

    it("WB R1 pairs seeds per seedOrder(4) = (1v4),(2v3)", () => {
      expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
      const m0 = at("winner", 1, 0);
      const m1 = at("winner", 1, 1);
      expect([m0.participantAId, m0.participantBId]).toEqual(["p1", "p4"]);
      expect([m1.participantAId, m1.participantBId]).toEqual(["p2", "p3"]);
    });

    it("WB R2 is the WB final (1 match)", () => {
      expect(
        matches.filter((m) => m.bracket === "winner" && m.round === 2),
      ).toHaveLength(1);
    });

    it("WB R1 losers drop into LB R1 slot 0, sides a/b", () => {
      const m0 = at("winner", 1, 0);
      const m1 = at("winner", 1, 1);
      expect(m0.loserRef).toEqual({
        bracket: "loser",
        round: 1,
        slot: 0,
        side: "a",
      });
      expect(m1.loserRef).toEqual({
        bracket: "loser",
        round: 1,
        slot: 0,
        side: "b",
      });
    });

    it("LB R1 is WB-R1-m0 loser vs WB-R1-m1 loser, then feeds LB final", () => {
      const lbR1 = at("loser", 1, 0);
      expect(lbR1.participantAId).toBeNull();
      expect(lbR1.participantBId).toBeNull();
      // LB R1 winner advances to LB final (LB R2 slot 0).
      expect(lbR1.nextRef!.bracket).toBe("loser");
      expect(lbR1.nextRef!.round).toBe(2);
      expect(lbR1.nextRef!.slot).toBe(0);
      // LB loser is eliminated.
      expect(lbR1.loserRef).toBeNull();
    });

    it("WB final loser drops into the LB final's open side", () => {
      const wbFinal = at("winner", 2, 0);
      const lbR1 = at("loser", 1, 0);
      // both feed the LB final (LB R2 slot 0) but on different sides
      expect(wbFinal.loserRef!.bracket).toBe("loser");
      expect(wbFinal.loserRef!.round).toBe(2);
      expect(wbFinal.loserRef!.slot).toBe(0);
      expect(wbFinal.loserRef!.side).not.toBe(lbR1.nextRef!.side);
    });

    it("GF participants come from WB-final and LB-final nextRefs", () => {
      const wbFinal = at("winner", 2, 0);
      const lbFinal = at("loser", 2, 0);
      expect(wbFinal.nextRef).toEqual({
        bracket: "grand_final",
        round: 1,
        slot: 0,
        side: "a",
      });
      expect(lbFinal.nextRef).toEqual({
        bracket: "grand_final",
        round: 1,
        slot: 0,
        side: "b",
      });
      const gf = at("grand_final", 1, 0);
      expect(gf.nextRef).toBeNull();
      expect(gf.loserRef).toBeNull();
    });

    it("all refs resolve and no side is double-claimed", () => {
      assertRefsResolve(matches);
    });
  });

  describe("N=8 invariants", () => {
    const matches = generateDoubleElim(participants(8));

    it("totals 14: WB 7 + LB 6 + GF 1", () => {
      expect(matches).toHaveLength(14);
      expect(matches.filter((m) => m.bracket === "winner")).toHaveLength(7);
      expect(matches.filter((m) => m.bracket === "loser")).toHaveLength(6);
      expect(
        matches.filter((m) => m.bracket === "grand_final"),
      ).toHaveLength(1);
    });

    it("LB round match counts are [2,2,1,1]", () => {
      expect(lbRoundCounts(matches)).toEqual([2, 2, 1, 1]);
    });

    it("every non-final WB match has a loserRef into an existing loser match", () => {
      const index = indexMatches(matches);
      const wbRounds = Math.max(
        ...matches
          .filter((m) => m.bracket === "winner")
          .map((m) => m.round),
      );
      for (const m of matches) {
        if (m.bracket !== "winner") continue;
        // every WB match (including the final) drops its loser into the LB
        expect(m.loserRef).not.toBeNull();
        expect(m.loserRef!.bracket).toBe("loser");
        expect(index.has(refKey(m.loserRef!))).toBe(true);
        // winner advancement: non-final stays in WB, final goes to GF
        if (m.round < wbRounds) {
          expect(m.nextRef!.bracket).toBe("winner");
        } else {
          expect(m.nextRef!.bracket).toBe("grand_final");
        }
      }
    });

    it("LB and GF matches never carry a loserRef", () => {
      for (const m of matches) {
        if (m.bracket === "loser" || m.bracket === "grand_final") {
          expect(m.loserRef).toBeNull();
        }
      }
    });

    it("all refs resolve to existing coordinates with no double-claimed side", () => {
      assertRefsResolve(matches);
    });
  });

  describe("N=16 invariants", () => {
    const matches = generateDoubleElim(participants(16));

    it("totals 30: WB 15 + LB 14 + GF 1", () => {
      expect(matches).toHaveLength(30);
      expect(matches.filter((m) => m.bracket === "winner")).toHaveLength(15);
      expect(matches.filter((m) => m.bracket === "loser")).toHaveLength(14);
      expect(
        matches.filter((m) => m.bracket === "grand_final"),
      ).toHaveLength(1);
    });

    it("LB round match counts are [4,4,2,2,1,1]", () => {
      expect(lbRoundCounts(matches)).toEqual([4, 4, 2, 2, 1, 1]);
    });

    it("all refs resolve to existing coordinates with no double-claimed side", () => {
      assertRefsResolve(matches);
    });
  });
});
