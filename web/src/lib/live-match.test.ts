import { describe, expect, it } from "vitest";

import {
  getDisplayedScore,
  getMatchDisplayState,
  hasValidScore,
  type LiveMatchInput,
} from "./live-match";

const match = (overrides: Partial<LiveMatchInput> = {}): LiveMatchInput => ({
  status: "pending",
  ...overrides,
});

describe("getMatchDisplayState", () => {
  it("distinguishes pending, active live, finished live, done, and bye", () => {
    expect(getMatchDisplayState(match())).toBe("pending");
    expect(getMatchDisplayState(match({ status: "live" }))).toBe("live");
    expect(
      getMatchDisplayState({
        status: "live",
        liveEndedAt: "2026-08-03T12:00:00.000Z",
      }),
    ).toBe("awaiting_confirmation");
    expect(getMatchDisplayState(match({ status: "done" }))).toBe("done");
    expect(getMatchDisplayState(match({ status: "bye" }))).toBe("bye");
  });
});

describe("getDisplayedScore", () => {
  it("shows live scores until the referee confirms the official result", () => {
    expect(
      getDisplayedScore(
        match({ status: "live", liveScoreA: 2, liveScoreB: 1 }),
      ),
    ).toEqual({ scoreA: 2, scoreB: 1 });
    expect(
      getDisplayedScore(
        match({
          status: "done",
          scoreA: 3,
          scoreB: 1,
          liveScoreA: 2,
          liveScoreB: 1,
        }),
      ),
    ).toEqual({ scoreA: 3, scoreB: 1 });
  });

  it("does not expose incomplete or invalid scores", () => {
    expect(
      getDisplayedScore(match({ status: "live", liveScoreA: 2 })),
    ).toBeNull();
    expect(hasValidScore(1, 0)).toBe(true);
    expect(hasValidScore(-1, 0)).toBe(false);
    expect(hasValidScore(1.5, 0)).toBe(false);
  });
});
