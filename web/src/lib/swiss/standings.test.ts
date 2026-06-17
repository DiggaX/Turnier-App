import { describe, expect, it } from "vitest";
import type { DoneMatch } from "@/lib/standings";
import { swissStandings } from "./standings";

describe("swissStandings", () => {
  it("ranks by wins, then diff, then scoreFor", () => {
    const done: DoneMatch[] = [
      { participantAId: "p1", participantBId: "p2", scoreA: 2, scoreB: 0 },
      { participantAId: "p3", participantBId: "p4", scoreA: 2, scoreB: 1 },
    ];
    const rows = swissStandings(done, []);
    expect(rows.map((r) => r.participantId)).toEqual(["p1", "p3", "p4", "p2"]);
    expect(rows[0]).toMatchObject({ participantId: "p1", wins: 1, played: 1 });
  });

  it("counts a bye as a win and includes bye-only players", () => {
    const rows = swissStandings([], ["p5"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      participantId: "p5",
      wins: 1,
      played: 1,
      scoreFor: 0,
      diff: 0,
    });
  });

  it("merges a bye into a player's existing head-to-head row", () => {
    const done: DoneMatch[] = [
      { participantAId: "p1", participantBId: "p2", scoreA: 1, scoreB: 0 },
    ];
    const rows = swissStandings(done, ["p1"]);
    const p1 = rows.find((r) => r.participantId === "p1")!;
    expect(p1).toMatchObject({ wins: 2, played: 2 });
  });
});
