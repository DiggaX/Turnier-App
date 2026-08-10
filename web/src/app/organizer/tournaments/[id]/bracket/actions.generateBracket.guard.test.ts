/**
 * Unit tests for generateBracket's guard on work in the existing bracket.
 *
 * Regenerating deletes every match of the tournament. Since adding a latecomer
 * makes that a mid-tournament action, the action must refuse to take released
 * results — or a match being counted right now — with it, unless the caller
 * explicitly says to. These tests pin that lock down at the action, independent
 * of any browser dialog.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

let mockClient: MockClient;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockClient),
}));

describe("generateBracket bracket-work guard", () => {
  let matchesSelect: ReturnType<typeof vi.fn>;
  let matchesDelete: ReturnType<typeof vi.fn>;

  /** Staff profile + a matches table holding `done` and `live` rows. */
  function setup(done: number, live: number) {
    const rows = [
      ...Array.from({ length: done }, () => ({ status: "done" })),
      ...Array.from({ length: live }, () => ({ status: "live" })),
    ];
    matchesSelect = vi.fn().mockReturnValue({
      eq: () => ({ in: () => Promise.resolve({ data: rows, error: null }) }),
    });
    matchesDelete = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });

    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { role: "organizer" }, error: null }),
              }),
            }),
          };
        }
        if (table === "matches") {
          return { select: matchesSelect, delete: matchesDelete };
        }
        if (table === "tournaments") {
          // Past the guard the action stops here; "not found" proves it got through.
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      }),
    };
  }

  beforeEach(() => {
    setup(0, 0);
  });

  it("refuses while results are released, and deletes nothing", async () => {
    setup(3, 0);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error:
        "Es gibt bereits 3 gespielte Ergebnisse. " +
        "Neu generieren löscht das unwiderruflich — bitte ausdrücklich bestätigen.",
    });
    expect(matchesDelete).not.toHaveBeenCalled();
  });

  it("refuses while a match is being counted", async () => {
    setup(0, 1);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error:
        "Es gibt bereits 1 laufendes Spiel. " +
        "Neu generieren löscht das unwiderruflich — bitte ausdrücklich bestätigen.",
    });
    expect(matchesDelete).not.toHaveBeenCalled();
  });

  it("names both kinds at once", async () => {
    setup(1, 1);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error:
        "Es gibt bereits 1 gespieltes Ergebnis und 1 laufendes Spiel. " +
        "Neu generieren löscht das unwiderruflich — bitte ausdrücklich bestätigen.",
    });
  });

  it("proceeds on an untouched bracket", async () => {
    setup(0, 0);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    // Past the guard: it moved on to loading the tournament.
    expect(result).toEqual({ error: "Turnier nicht gefunden." });
  });

  it("proceeds on explicit confirmation, without re-counting", async () => {
    setup(3, 2);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1", { discardResults: true });

    expect(result).toEqual({ error: "Turnier nicht gefunden." });
    expect(matchesSelect).not.toHaveBeenCalled();
  });
});
