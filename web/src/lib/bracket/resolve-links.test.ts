import { describe, it, expect } from "vitest";

import { generateSingleElim } from "@/lib/bracket/single-elim";
import {
  buildIdMap,
  resolveByeAdvances,
  resolveLinkUpdates,
  roundSlotKey,
} from "@/lib/bracket/resolve-links";
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";

function participants(n: number): SeededParticipant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));
}

/** Fake DB insert: assign a deterministic id per (round, slot). */
function fakeInserted(generated: GeneratedMatch[]) {
  return generated.map((m) => ({
    round: m.round,
    slot: m.slot,
    id: `id-${m.round}-${m.slot}`,
  }));
}

describe("buildIdMap", () => {
  it("maps every (round, slot) to its inserted id", () => {
    const gen = generateSingleElim(participants(4));
    const map = buildIdMap(gen, fakeInserted(gen));
    expect(map.get(roundSlotKey(1, 0))).toBe("id-1-0");
    expect(map.get(roundSlotKey(2, 0))).toBe("id-2-0");
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

    const s0 = updates.find((u) => u.id === "id-1-0")!;
    const s1 = updates.find((u) => u.id === "id-1-1")!;
    expect(s0).toEqual({
      id: "id-1-0",
      nextMatchId: "id-2-0",
      nextSlot: "a",
    });
    expect(s1).toEqual({
      id: "id-1-1",
      nextMatchId: "id-2-0",
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
      `id-${bye.nextRef!.round}-${bye.nextRef!.slot}`,
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
