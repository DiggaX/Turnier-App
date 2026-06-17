import { describe, expect, it } from "vitest";
import type { SeededParticipant } from "@/lib/bracket/types";
import { assignGroups, generateGroupStage, groupCountFor } from "./groups";

const seed = (n: number): SeededParticipant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));

describe("groupCountFor", () => {
  it("is ceil(N/4), min 2 once N>=6, else 0 below 6", () => {
    expect(groupCountFor(5)).toBe(0);
    expect(groupCountFor(6)).toBe(2);
    expect(groupCountFor(8)).toBe(2);
    expect(groupCountFor(9)).toBe(3);
    expect(groupCountFor(16)).toBe(4);
  });
});

describe("assignGroups", () => {
  it("snake-distributes by seed into G balanced groups", () => {
    const groups = assignGroups(seed(8), 2);
    expect(groups).toHaveLength(2);
    // snake: seeds 1,4,5,8 -> group 0 ; 2,3,6,7 -> group 1
    expect(groups[0].map((p) => p.seed)).toEqual([1, 4, 5, 8]);
    expect(groups[1].map((p) => p.seed)).toEqual([2, 3, 6, 7]);
  });

  it("handles uneven counts (sizes differ by at most 1)", () => {
    const groups = assignGroups(seed(6), 2); // snake: 1,4,5 | 2,3,6
    expect(groups[0].map((p) => p.seed)).toEqual([1, 4, 5]);
    expect(groups[1].map((p) => p.seed)).toEqual([2, 3, 6]);
  });
});

describe("generateGroupStage", () => {
  it("emits a round-robin per group, each match tagged with its group_no", () => {
    const matches = generateGroupStage(seed(8), 2);
    // 2 groups of 4 -> each group round-robin = C(4,2)=6 matches -> 12 total
    expect(matches).toHaveLength(12);
    expect(matches.every((m) => m.bracket === "winner")).toBe(true);
    const g0 = matches.filter((m) => m.groupNo === 0);
    const g1 = matches.filter((m) => m.groupNo === 1);
    expect(g0).toHaveLength(6);
    expect(g1).toHaveLength(6);
    // every group-0 match is between group-0 members
    const g0ids = new Set(["p1", "p4", "p5", "p8"]);
    expect(
      g0.every(
        (m) => g0ids.has(m.participantAId!) && g0ids.has(m.participantBId!),
      ),
    ).toBe(true);
  });
});
