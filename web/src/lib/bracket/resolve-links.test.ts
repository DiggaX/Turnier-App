import { describe, it, expect } from "vitest";

import { generateDoubleElim } from "@/lib/bracket/double-elim";
import { generateSingleElim } from "@/lib/bracket/single-elim";
import {
  buildIdMap,
  resolveByeAdvances,
  resolveLinkUpdates,
  resolveLoserLinkUpdates,
  roundSlotKey,
} from "@/lib/bracket/resolve-links";
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";

function participants(n: number): SeededParticipant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));
}

/** Fake DB insert: assign a deterministic id per (bracket, round, slot). */
function fakeInserted(generated: GeneratedMatch[]) {
  return generated.map((m) => ({
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    id: `id-${m.bracket}-${m.round}-${m.slot}`,
  }));
}

describe("buildIdMap", () => {
  it("maps every (bracket, round, slot) to its inserted id", () => {
    const gen = generateSingleElim(participants(4));
    const map = buildIdMap(gen, fakeInserted(gen));
    expect(map.get(roundSlotKey("winner", 1, 0))).toBe("id-winner-1-0");
    expect(map.get(roundSlotKey("winner", 2, 0))).toBe("id-winner-2-0");
    expect(map.size).toBe(gen.length);
  });

  it("throws when an inserted row is missing for a generated match", () => {
    const gen = generateSingleElim(participants(4));
    const incomplete = fakeInserted(gen).filter(
      (r) => !(r.round === 2 && r.slot === 0),
    );
    expect(() => buildIdMap(gen, incomplete)).toThrow(/Missing inserted match/);
  });
});

describe("resolveLinkUpdates", () => {
  it("wires round-1 slots into the final on the correct side (N=4)", () => {
    const gen = generateSingleElim(participants(4));
    const map = buildIdMap(gen, fakeInserted(gen));
    const updates = resolveLinkUpdates(gen, map);

    // 2 non-final matches link forward; the final does not.
    expect(updates).toHaveLength(2);

    const s0 = updates.find((u) => u.id === "id-winner-1-0")!;
    const s1 = updates.find((u) => u.id === "id-winner-1-1")!;
    expect(s0).toEqual({
      id: "id-winner-1-0",
      nextMatchId: "id-winner-2-0",
      nextSlot: "a",
    });
    expect(s1).toEqual({
      id: "id-winner-1-1",
      nextMatchId: "id-winner-2-0",
      nextSlot: "b",
    });
  });

  it("produces nothing for matches without nextRef (round-robin / final)", () => {
    const gen = generateSingleElim(participants(2)); // single final, no nextRef
    const map = buildIdMap(gen, fakeInserted(gen));
    expect(resolveLinkUpdates(gen, map)).toEqual([]);
  });

  it("count equals number of non-final matches (N=8 → 6)", () => {
    const gen = generateSingleElim(participants(8));
    const map = buildIdMap(gen, fakeInserted(gen));
    // 7 matches total, 1 final has no nextRef → 6 links.
    expect(resolveLinkUpdates(gen, map)).toHaveLength(6);
  });
});

describe("resolveByeAdvances", () => {
  it("advances each bye winner into its next match slot (N=3 → 1 bye)", () => {
    const gen = generateSingleElim(participants(3));
    const map = buildIdMap(gen, fakeInserted(gen));
    const advances = resolveByeAdvances(gen, map);

    expect(advances).toHaveLength(1);
    const bye = gen.find((m) => m.status === "bye")!;
    const a = advances[0];
    expect(a.winnerId).toBe(bye.winnerId);
    expect(a.nextMatchId).toBe(
      `id-${bye.nextRef!.bracket}-${bye.nextRef!.round}-${bye.nextRef!.slot}`,
    );
    expect(a.nextSlot).toBe(bye.nextRef!.side);
  });

  it("N=6 → 2 byes both advance the top seeds", () => {
    const gen = generateSingleElim(participants(6));
    const map = buildIdMap(gen, fakeInserted(gen));
    const advances = resolveByeAdvances(gen, map);
    expect(advances).toHaveLength(2);
    expect(advances.map((a) => a.winnerId).sort()).toEqual(["p1", "p2"]);
  });

  it("no byes for a full bracket (N=8)", () => {
    const gen = generateSingleElim(participants(8));
    const map = buildIdMap(gen, fakeInserted(gen));
    expect(resolveByeAdvances(gen, map)).toEqual([]);
  });
});

describe("double elimination resolve (keyed on bracket, round, slot)", () => {
  it("maps every (bracket, round, slot) across all three brackets (N=4)", () => {
    const gen = generateDoubleElim(participants(4));
    const map = buildIdMap(gen, fakeInserted(gen));
    expect(map.size).toBe(gen.length);
    // Each bracket present and keyed independently.
    expect(map.get(roundSlotKey("winner", 1, 0))).toBe("id-winner-1-0");
    expect(map.get(roundSlotKey("loser", 1, 0))).toBe("id-loser-1-0");
    expect(map.get(roundSlotKey("grand_final", 1, 0))).toBe(
      "id-grand_final-1-0",
    );
  });

  it("resolves nextRef across brackets: WB final + LB final feed the grand final", () => {
    const gen = generateDoubleElim(participants(4));
    const map = buildIdMap(gen, fakeInserted(gen));
    const updates = resolveLinkUpdates(gen, map);

    // WB final (winner R2 slot 0) winner -> grand final side a.
    const wbFinal = updates.find((u) => u.id === "id-winner-2-0")!;
    expect(wbFinal).toEqual({
      id: "id-winner-2-0",
      nextMatchId: "id-grand_final-1-0",
      nextSlot: "a",
    });

    // LB final (loser R2 slot 0 for N=4) winner -> grand final side b.
    const lbFinal = updates.find((u) => u.id === "id-loser-2-0")!;
    expect(lbFinal).toEqual({
      id: "id-loser-2-0",
      nextMatchId: "id-grand_final-1-0",
      nextSlot: "b",
    });

    // The grand final itself has no nextRef → no update.
    expect(updates.find((u) => u.id === "id-grand_final-1-0")).toBeUndefined();
  });

  it("resolves loserRef: WB-R1 losers drop into the LB on the correct sides (N=4)", () => {
    const gen = generateDoubleElim(participants(4));
    const map = buildIdMap(gen, fakeInserted(gen));
    const loserUpdates = resolveLoserLinkUpdates(gen, map);

    // Both WB round-1 matches drop their loser into LB round 1, slot 0
    // (slot 0 -> side a, slot 1 -> side b).
    const drop0 = loserUpdates.find((u) => u.id === "id-winner-1-0")!;
    const drop1 = loserUpdates.find((u) => u.id === "id-winner-1-1")!;
    expect(drop0).toEqual({
      id: "id-winner-1-0",
      loserNextMatchId: "id-loser-1-0",
      loserNextSlot: "a",
    });
    expect(drop1).toEqual({
      id: "id-winner-1-1",
      loserNextMatchId: "id-loser-1-0",
      loserNextSlot: "b",
    });

    // WB final (winner R2) loser drops into the major LB round 2.
    const wbFinalDrop = loserUpdates.find((u) => u.id === "id-winner-2-0")!;
    expect(wbFinalDrop).toEqual({
      id: "id-winner-2-0",
      loserNextMatchId: "id-loser-2-0",
      loserNextSlot: "b",
    });

    // Only winner-bracket matches carry a loserRef.
    expect(loserUpdates.every((u) => u.id.startsWith("id-winner-"))).toBe(true);
    // LB and grand-final matches produce no loser links.
    expect(loserUpdates.find((u) => u.id.startsWith("id-loser-"))).toBeUndefined();
  });
});
