import { describe, expect, it } from "vitest";
import type { SeededParticipant } from "@/lib/bracket/types";
import { generateSwissRoundOne } from "./generate";

const seed = (n: number): SeededParticipant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));

describe("generateSwissRoundOne", () => {
  it("emits N/2 pending round-1 matches for even N", () => {
    const m = generateSwissRoundOne(seed(4));
    expect(m).toHaveLength(2);
    expect(m.every((x) => x.round === 1 && x.status === "pending")).toBe(true);
    expect(m.map((x) => x.slot)).toEqual([0, 1]);
    expect(m[0]).toMatchObject({ participantAId: "p1", participantBId: "p2" });
  });

  it("adds a bye row (winner set, status 'bye') for odd N", () => {
    const m = generateSwissRoundOne(seed(5));
    expect(m).toHaveLength(3);
    const bye = m.find((x) => x.status === "bye")!;
    expect(bye).toMatchObject({
      participantAId: "p5",
      participantBId: null,
      winnerId: "p5",
    });
  });

  it("returns [] below 2 participants", () => {
    expect(generateSwissRoundOne(seed(1))).toEqual([]);
  });
});
