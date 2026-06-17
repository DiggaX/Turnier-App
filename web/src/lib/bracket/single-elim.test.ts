import { describe, it, expect } from "vitest";
import { generateSingleElim } from "@/lib/bracket/single-elim";
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";

/** Build participants p1..pN with seeds 1..N (in arbitrary input order). */
function participants(
  n: number,
  order: "asc" | "shuffled" = "asc",
): SeededParticipant[] {
  const list: SeededParticipant[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    seed: i + 1,
  }));
  if (order === "shuffled") {
    // reverse to prove the function sorts by seed itself
    return [...list].reverse();
  }
  return list;
}

function byId(matches: GeneratedMatch[], round: number, slot: number) {
  return matches.find((m) => m.round === round && m.slot === slot);
}

/** Assert the structural invariants of a single-elim tree. */
function assertValidTree(matches: GeneratedMatch[], size: number) {
  const rounds = Math.log2(size);
  for (let r = 1; r <= rounds; r++) {
    const expected = size / 2 ** r;
    const inRound = matches.filter((m) => m.round === r);
    expect(inRound).toHaveLength(expected);
    // slots are 0..expected-1, unique
    const slots = inRound.map((m) => m.slot).sort((a, b) => a - b);
    expect(slots).toEqual(Array.from({ length: expected }, (_, i) => i));
  }
  // nextRef targets must exist; final has no nextRef
  for (const m of matches) {
    if (m.round === rounds) {
      expect(m.nextRef).toBeNull();
    } else {
      expect(m.nextRef).not.toBeNull();
      const ref = m.nextRef!;
      expect(byId(matches, ref.round, ref.slot)).toBeDefined();
      expect(ref.round).toBe(m.round + 1);
      expect(ref.slot).toBe(Math.floor(m.slot / 2));
      expect(ref.side).toBe(m.slot % 2 === 0 ? "a" : "b");
    }
  }
}

describe("generateSingleElim", () => {
  it("returns [] for N=1", () => {
    expect(generateSingleElim(participants(1))).toEqual([]);
  });

  it("N=2: single pending final, both present, no nextRef", () => {
    const matches = generateSingleElim(participants(2));
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m.round).toBe(1);
    expect(m.slot).toBe(0);
    expect(m.participantAId).toBe("p1");
    expect(m.participantBId).toBe("p2");
    expect(m.status).toBe("pending");
    expect(m.winnerId).toBeNull();
    expect(m.nextRef).toBeNull();
  });

  it("N=4: round1 pairs (1v4)&(2v3), round2 final, links wire up; total 3", () => {
    const matches = generateSingleElim(participants(4, "shuffled"));
    expect(matches).toHaveLength(3);
    assertValidTree(matches, 4);

    const r1s0 = byId(matches, 1, 0)!;
    const r1s1 = byId(matches, 1, 1)!;
    expect([r1s0.participantAId, r1s0.participantBId]).toEqual(["p1", "p4"]);
    expect([r1s1.participantAId, r1s1.participantBId]).toEqual(["p2", "p3"]);
    expect(r1s0.status).toBe("pending");
    expect(r1s1.status).toBe("pending");

    // slot0 -> final side a, slot1 -> final side b
    expect(r1s0.nextRef).toEqual({ round: 2, slot: 0, side: "a" });
    expect(r1s1.nextRef).toEqual({ round: 2, slot: 0, side: "b" });

    const final = byId(matches, 2, 0)!;
    expect(final.participantAId).toBeNull();
    expect(final.participantBId).toBeNull();
    expect(final.status).toBe("pending");
    expect(final.nextRef).toBeNull();
  });

  it("N=3: size 4, top seed gets a bye that auto-advances; total 3", () => {
    const matches = generateSingleElim(participants(3));
    expect(matches).toHaveLength(3);
    assertValidTree(matches, 4);

    const byes = matches.filter((m) => m.status === "bye");
    expect(byes).toHaveLength(1);
    const bye = byes[0];
    // top seed (p1) auto-advances
    expect(bye.winnerId).toBe("p1");
    expect(
      bye.participantAId === "p1" || bye.participantBId === "p1",
    ).toBe(true);

    // seeds 2 & 3 meet in a pending match
    const pendingR1 = matches.filter(
      (m) => m.round === 1 && m.status === "pending",
    );
    expect(pendingR1).toHaveLength(1);
    expect(
      [pendingR1[0].participantAId, pendingR1[0].participantBId].sort(),
    ).toEqual(["p2", "p3"]);
  });

  it("N=6: size 8, 2 byes on top seeds, 7 matches, rounds [4,2,1]", () => {
    const matches = generateSingleElim(participants(6));
    expect(matches).toHaveLength(7); // size - 1

    const byes = matches.filter((m) => m.status === "bye");
    expect(byes).toHaveLength(2);
    // byes land on the two top seeds p1 and p2
    const byeWinners = byes.map((b) => b.winnerId).sort();
    expect(byeWinners).toEqual(["p1", "p2"]);

    assertValidTree(matches, 8);

    expect(matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(matches.filter((m) => m.round === 2)).toHaveLength(2);
    expect(matches.filter((m) => m.round === 3)).toHaveLength(1);

    // every non-final has a nextRef; final has none
    const finals = matches.filter((m) => m.nextRef === null);
    expect(finals).toHaveLength(1);
    expect(finals[0].round).toBe(3);
  });

  it("N=8: 7 matches, 0 byes, round-1 pairings follow seedOrder(8)", () => {
    const matches = generateSingleElim(participants(8));
    expect(matches).toHaveLength(7);
    expect(matches.filter((m) => m.status === "bye")).toHaveLength(0);
    assertValidTree(matches, 8);

    // seedOrder(8) = [1,8,4,5,2,7,3,6]
    const expectedR1: [string, string][] = [
      ["p1", "p8"],
      ["p4", "p5"],
      ["p2", "p7"],
      ["p3", "p6"],
    ];
    for (let i = 0; i < 4; i++) {
      const m = byId(matches, 1, i)!;
      expect([m.participantAId, m.participantBId]).toEqual(expectedR1[i]);
    }
  });
});
