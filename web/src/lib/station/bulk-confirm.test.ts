import { describe, expect, it } from "vitest";

import {
  bulkConfirmable,
  confirmSequentially,
  type ConfirmCandidate,
  type ConfirmItem,
} from "./station";

const mk = (over: Partial<ConfirmCandidate> = {}): ConfirmCandidate => ({
  id: "m1",
  status: "pending",
  participantAId: "p1",
  participantBId: "p2",
  aName: "Alpha",
  bName: "Beta",
  reports: [
    { scoreA: 2, scoreB: 1 },
    { scoreA: 2, scoreB: 1 },
  ],
  ...over,
});

describe("bulkConfirmable", () => {
  it("takes a match both sides agree on, with the label and the score", () => {
    expect(bulkConfirmable([mk()])).toEqual([
      { id: "m1", label: "Alpha vs Beta", scoreA: 2, scoreB: 1 },
    ]);
  });

  it("skips a missing counter-report", () => {
    expect(bulkConfirmable([mk({ reports: [{ scoreA: 2, scoreB: 1 }] })])).toEqual(
      [],
    );
    expect(bulkConfirmable([mk({ reports: [] })])).toEqual([]);
  });

  it("skips a disagreement — that stays a single decision", () => {
    expect(
      bulkConfirmable([
        mk({
          reports: [
            { scoreA: 2, scoreB: 1 },
            { scoreA: 1, scoreB: 2 },
          ],
        }),
      ]),
    ).toEqual([]);
  });

  it("skips an agreed draw, because confirm_match rejects it", () => {
    expect(
      bulkConfirmable([
        mk({
          reports: [
            { scoreA: 1, scoreB: 1 },
            { scoreA: 1, scoreB: 1 },
          ],
        }),
      ]),
    ).toEqual([]);
  });

  it("skips matches that are done or have an empty slot", () => {
    expect(bulkConfirmable([mk({ status: "done" })])).toEqual([]);
    expect(bulkConfirmable([mk({ participantBId: null })])).toEqual([]);
  });

  it("keeps the rest when one match in the list is not releasable", () => {
    const ok = mk({ id: "m2", aName: "Gamma", bName: "Delta" });
    expect(bulkConfirmable([mk({ status: "done" }), ok])).toEqual([
      { id: "m2", label: "Gamma vs Delta", scoreA: 2, scoreB: 1 },
    ]);
  });
});

describe("confirmSequentially", () => {
  const item = (id: string): ConfirmItem => ({
    id,
    label: `${id}-A vs ${id}-B`,
    scoreA: 2,
    scoreB: 1,
  });

  it("releases every match and reports no failure", async () => {
    const seen: string[] = [];
    const progress: number[] = [];
    const failures = await confirmSequentially(
      [item("m1"), item("m2")],
      async (i) => {
        seen.push(i.id);
      },
      (n) => progress.push(n),
    );
    expect(seen).toEqual(["m1", "m2"]);
    expect(progress).toEqual([1, 2]);
    expect(failures).toEqual([]);
  });

  it("carries on after a failure in the middle and names the loser", async () => {
    const seen: string[] = [];
    const failures = await confirmSequentially(
      [item("m1"), item("m2"), item("m3")],
      async (i) => {
        seen.push(i.id);
        if (i.id === "m2") throw new Error("draw not allowed");
      },
    );
    expect(seen).toEqual(["m1", "m2", "m3"]);
    expect(failures).toEqual([
      {
        id: "m2",
        label: "m2-A vs m2-B",
        reason: "Unentschieden ist nicht erlaubt.",
      },
    ]);
  });

  it("names a blocking follow-up match as the reason", async () => {
    const failures = await confirmSequentially([item("m1")], async () => {
      throw {
        message: "Folge-Match bereits entschieden — bitte zuerst dort korrigieren",
      };
    });
    expect(failures[0].reason).toBe(
      "Folgepartie ist schon freigegeben — dort zuerst korrigieren.",
    );
  });
});
