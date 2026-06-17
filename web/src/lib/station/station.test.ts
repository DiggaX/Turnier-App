import { describe, expect, it } from "vitest";
import { agreedScore, isPlayable, type StationMatch, type Report } from "./station";

const mk = (over: Partial<StationMatch> = {}): StationMatch => ({
  status: "pending",
  participantAId: "p1",
  participantBId: "p2",
  ...over,
});

describe("isPlayable", () => {
  it("is true for pending/live matches with both slots filled", () => {
    expect(isPlayable(mk({ status: "pending" }))).toBe(true);
    expect(isPlayable(mk({ status: "live" }))).toBe(true);
  });
  it("is false for done/bye or an empty slot", () => {
    expect(isPlayable(mk({ status: "done" }))).toBe(false);
    expect(isPlayable(mk({ status: "bye" }))).toBe(false);
    expect(isPlayable(mk({ participantBId: null }))).toBe(false);
  });
});

describe("agreedScore", () => {
  const r = (a: number, b: number): Report => ({ scoreA: a, scoreB: b });
  it("returns the score when all reports agree", () => {
    expect(agreedScore([r(2, 1), r(2, 1)])).toEqual({ scoreA: 2, scoreB: 1 });
    expect(agreedScore([r(3, 0)])).toEqual({ scoreA: 3, scoreB: 0 });
  });
  it("returns null when reports conflict or there are none", () => {
    expect(agreedScore([r(2, 1), r(1, 2)])).toBeNull();
    expect(agreedScore([])).toBeNull();
  });
});
