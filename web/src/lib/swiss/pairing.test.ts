import { describe, expect, it } from "vitest";
import { pairKey, pairSwissRound, swissRoundCount } from "./pairing";

describe("swissRoundCount", () => {
  it("is ceil(log2(N)), min 1 for N>=2, and 0 below", () => {
    expect(swissRoundCount(1)).toBe(0);
    expect(swissRoundCount(2)).toBe(1);
    expect(swissRoundCount(4)).toBe(2);
    expect(swissRoundCount(5)).toBe(3);
    expect(swissRoundCount(8)).toBe(3);
    expect(swissRoundCount(16)).toBe(4);
  });
});

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
});

describe("pairSwissRound", () => {
  const empty = () => new Set<string>();

  it("pairs adjacent ranked players with no history (even N)", () => {
    const { pairings, bye } = pairSwissRound(
      ["p1", "p2", "p3", "p4"],
      empty(),
      empty(),
    );
    expect(bye).toBeNull();
    expect(pairings).toEqual([
      ["p1", "p2"],
      ["p3", "p4"],
    ]);
  });

  it("gives the lowest-ranked bye-less player a bye (odd N)", () => {
    const { pairings, bye } = pairSwissRound(
      ["p1", "p2", "p3"],
      empty(),
      empty(),
    );
    expect(bye).toBe("p3");
    expect(pairings).toEqual([["p1", "p2"]]);
  });

  it("skips a player who already had a bye when choosing the new bye", () => {
    const { pairings, bye } = pairSwissRound(
      ["p1", "p2", "p3"],
      empty(),
      new Set(["p3"]),
    );
    expect(bye).toBe("p2");
    expect(pairings).toEqual([["p1", "p3"]]);
  });

  it("avoids rematches by pairing the next un-played opponent", () => {
    const played = new Set([pairKey("p1", "p2"), pairKey("p3", "p4")]);
    const { pairings } = pairSwissRound(
      ["p1", "p2", "p3", "p4"],
      played,
      new Set(),
    );
    expect(pairings).toEqual([
      ["p1", "p3"],
      ["p2", "p4"],
    ]);
  });

  it("falls back to a rematch when no fresh opponent remains", () => {
    const played = new Set([pairKey("p1", "p2")]);
    const { pairings, bye } = pairSwissRound(["p1", "p2"], played, new Set());
    expect(bye).toBeNull();
    expect(pairings).toEqual([["p1", "p2"]]);
  });
});
