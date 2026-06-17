import { describe, expect, it } from "vitest";
import { seedPlayoffAdvancers } from "./playoff-seeding";

describe("seedPlayoffAdvancers", () => {
  it("takes top 2 per group; winners then runners-up reversed", () => {
    // 2 groups, each already ranked best-first
    const ranked = [
      ["A1", "A2", "A3"],
      ["B1", "B2", "B3"],
    ];
    const seeded = seedPlayoffAdvancers(ranked, 2);
    // winners [A1,B1] then runners-up reversed [B2,A2]
    expect(seeded.map((p) => p.id)).toEqual(["A1", "B1", "B2", "A2"]);
    expect(seeded.map((p) => p.seed)).toEqual([1, 2, 3, 4]);
  });

  it("supports more than two groups", () => {
    const ranked = [
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"],
    ];
    const seeded = seedPlayoffAdvancers(ranked, 2);
    expect(seeded.map((p) => p.id)).toEqual(["A1", "B1", "C1", "C2", "B2", "A2"]);
  });

  it("skips groups too small to supply an advancer at a given rank", () => {
    const ranked = [["A1"], ["B1", "B2"]];
    const seeded = seedPlayoffAdvancers(ranked, 2);
    // winners [A1,B1], runners-up reversed [B2] (A has no 2nd)
    expect(seeded.map((p) => p.id)).toEqual(["A1", "B1", "B2"]);
  });
});
