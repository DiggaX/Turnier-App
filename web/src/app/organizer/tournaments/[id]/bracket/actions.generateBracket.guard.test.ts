/**
 * Unit tests for generateBracket's released-results guard.
 *
 * Regenerating deletes every match of the tournament. Since adding a latecomer
 * makes that a mid-tournament action, the action must refuse to take released
 * results with it unless the caller explicitly says to. These tests pin that
 * lock down at the action, independent of any browser dialog.
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

describe("generateBracket released-results guard", () => {
  let matchesSelect: ReturnType<typeof vi.fn>;
  let matchesDelete: ReturnType<typeof vi.fn>;

  /** Staff profile + a matches table reporting `decided` done matches. */
  function setup(decided: number) {
    matchesSelect = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => Promise.resolve({ count: decided, error: null }),
      }),
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
    setup(0);
  });

  it("refuses to run while results are released, and deletes nothing", async () => {
    setup(3);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error:
        "Es gibt bereits 3 freigegebene Ergebnisse. " +
        "Neu generieren würde sie löschen — bitte ausdrücklich bestätigen.",
    });
    expect(matchesDelete).not.toHaveBeenCalled();
  });

  it("uses the singular for exactly one result", async () => {
    setup(1);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error:
        "Es gibt bereits 1 freigegebenes Ergebnis. " +
        "Neu generieren würde es löschen — bitte ausdrücklich bestätigen.",
    });
  });

  it("proceeds when nothing has been released yet", async () => {
    setup(0);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    // Past the guard: it moved on to loading the tournament.
    expect(result).toEqual({ error: "Turnier nicht gefunden." });
  });

  it("proceeds on explicit confirmation, without re-counting", async () => {
    setup(3);
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1", { discardResults: true });

    expect(result).toEqual({ error: "Turnier nicht gefunden." });
    expect(matchesSelect).not.toHaveBeenCalled();
  });
});
