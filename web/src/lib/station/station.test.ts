import { describe, expect, it } from "vitest";
import { agreedScore, isPlayable, scorePrefill, type StationMatch, type Report } from "./station";

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
    expect(agreedScore([r(3, 0)])).toBeNull();
  });
  it("returns null when reports conflict or there are none", () => {
    expect(agreedScore([r(2, 1), r(1, 2)])).toBeNull();
    expect(agreedScore([])).toBeNull();
  });
describe("scorePrefill", () => {
  const report = (scoreA: number, scoreB: number): Report => ({
    scoreA,
    scoreB,
  });
  const finished = (scoreA: number | null, scoreB: number | null) => ({
    liveScoreA: scoreA,
    liveScoreB: scoreB,
    liveEndedAt: "2026-08-03T12:00:00.000Z",
  });

  it("prefers two matching player reports over the scorekeeper proposal", () => {
    expect(
      scorePrefill([report(3, 1), report(3, 1)], finished(1, 0)),
    ).toEqual({ scoreA: 3, scoreB: 1, source: "player_reports" });
  });

  it("uses a finished scorekeeper score without marking conflicting reports agreed", () => {
    expect(
      scorePrefill([report(2, 1), report(1, 2)], finished(4, 2)),
    ).toEqual({ scoreA: 4, scoreB: 2, source: "scorekeeper" });
  });

  it("does not use a live score before finish or an invalid score", () => {
    expect(
      scorePrefill([], {
        liveScoreA: 2,
        liveScoreB: 1,
        liveEndedAt: null,
      }),
    ).toBeNull();
    expect(scorePrefill([], finished(-1, 1))).toBeNull();
  });
});
});
