import { describe, expect, it } from "vitest";
import { participantsToNotify, type NotifiableMatch } from "./targets";

const m = (
  status: string,
  a: string | null,
  b: string | null,
): NotifiableMatch => ({ status, participantAId: a, participantBId: b });

describe("participantsToNotify", () => {
  it("returns both participants of each playable match (pending/live, both filled)", () => {
    const ids = participantsToNotify([
      m("pending", "p1", "p2"),
      m("live", "p3", "p4"),
    ]);
    expect([...ids].sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("skips done/bye matches and matches with an empty slot", () => {
    const ids = participantsToNotify([
      m("done", "p1", "p2"),
      m("bye", "p5", null),
      m("pending", "p6", null),
      m("pending", "p7", "p8"),
    ]);
    expect([...ids].sort()).toEqual(["p7", "p8"]);
  });

  it("de-duplicates a participant appearing in multiple playable matches", () => {
    const ids = participantsToNotify([
      m("pending", "p1", "p2"),
      m("live", "p2", "p3"),
    ]);
    expect([...ids].sort()).toEqual(["p1", "p2", "p3"]);
  });
});
