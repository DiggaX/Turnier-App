/**
 * Unit tests for generateBracket's guard on work in the existing bracket.
 *
 * Regenerating deletes every match of the tournament. Since adding a latecomer
 * makes that a mid-tournament action, the action must refuse to take existing
 * work with it unless the caller explicitly says to: released results, matches
 * being counted right now, and player reports sitting on pending matches. These
 * tests pin that lock down at the action, independent of any browser dialog.
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
  let reportsSelect: ReturnType<typeof vi.fn>;

  /**
   * Staff profile + a bracket holding `done` / `live` matches and pending ones,
   * of which `reportedPending` carry player reports.
   */
  function setup(options: {
    done?: number;
    live?: number;
    reportedPending?: number;
    plainPending?: number;
  }) {
    const done = options.done ?? 0;
    const live = options.live ?? 0;
    const reportedPending = options.reportedPending ?? 0;
    const plainPending = options.plainPending ?? 0;

    const matchRows = [
      ...Array.from({ length: done }, (_, i) => ({
        id: `d${i}`,
        status: "done",
      })),
      ...Array.from({ length: live }, (_, i) => ({
        id: `l${i}`,
        status: "live",
      })),
      ...Array.from({ length: reportedPending + plainPending }, (_, i) => ({
        id: `p${i}`,
        status: "pending",
      })),
    ];
    // Two reports on the first reported match: both players said their score.
    // The guard must count the match once, not the reports.
    const reportRows = [
      ...Array.from({ length: reportedPending }, (_, i) => ({
        match_id: `p${i}`,
      })),
      ...(reportedPending > 0 ? [{ match_id: "p0" }] : []),
    ];

    matchesSelect = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ data: matchRows, error: null }),
    });
    matchesDelete = vi.fn().mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    reportsSelect = vi.fn().mockReturnValue({
      in: () => Promise.resolve({ data: reportRows, error: null }),
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
        if (table === "match_reports") return { select: reportsSelect };
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

  const confirmTail =
    "Neu generieren löscht das unwiderruflich — bitte ausdrücklich bestätigen.";

  beforeEach(() => {
    setup({});
  });

  it("refuses while results are released, and deletes nothing", async () => {
    setup({ done: 3 });
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error: `Es gibt bereits 3 gespielte Ergebnisse. ${confirmTail}`,
    });
    expect(matchesDelete).not.toHaveBeenCalled();
  });

  it("refuses while a match is being counted", async () => {
    setup({ live: 1 });
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error: `Es gibt bereits 1 laufendes Spiel. ${confirmTail}`,
    });
    expect(matchesDelete).not.toHaveBeenCalled();
  });

  it("refuses over reports on pending matches, counting matches not reports", async () => {
    setup({ reportedPending: 2, plainPending: 4 });
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error: `Es gibt bereits 2 gemeldete Ergebnisse ohne Freigabe. ${confirmTail}`,
    });
    expect(matchesDelete).not.toHaveBeenCalled();
  });

  it("names all three kinds at once", async () => {
    setup({ done: 3, live: 1, reportedPending: 2 });
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({
      error:
        "Es gibt bereits 3 gespielte Ergebnisse, 1 laufendes Spiel und " +
        `2 gemeldete Ergebnisse ohne Freigabe. ${confirmTail}`,
    });
  });

  it("proceeds when pending matches carry no reports", async () => {
    setup({ plainPending: 8 });
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    // Past the guard: it moved on to loading the tournament.
    expect(result).toEqual({ error: "Turnier nicht gefunden." });
  });

  it("proceeds on an empty bracket without asking for reports", async () => {
    setup({});
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1");

    expect(result).toEqual({ error: "Turnier nicht gefunden." });
    expect(reportsSelect).not.toHaveBeenCalled();
  });

  it("proceeds on explicit confirmation, without re-counting", async () => {
    setup({ done: 3, live: 2, reportedPending: 1 });
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1", { discardResults: true });

    expect(result).toEqual({ error: "Turnier nicht gefunden." });
    expect(matchesSelect).not.toHaveBeenCalled();
    expect(reportsSelect).not.toHaveBeenCalled();
  });
});

/**
 * Was am Ende mit dem Turnierstatus passiert.
 *
 * Neu generieren schrieb bis hierher immer status='running'. Seit die
 * Nachmeldung daraus eine Aktion MITTEN im Turnier gemacht hat, traf das auch
 * ein abgeschlossenes Turnier: der Endstand war weg, der Sieger wieder offen,
 * und nichts sagte, warum.
 */
describe("generateBracket tournament status", () => {
  /**
   * Der volle Durchlauf bis zum Statuswechsel, mit zwei eingecheckten
   * Wettkaempfern. Format round_robin mit Absicht: es braucht keine
   * Verkettung der Matches, der Weg endet also direkt an der Stelle, um die es
   * hier geht. Die seeds stehen schon auf 1 und 2, damit keine Korrektur-
   * UPDATEs dazwischenfunken.
   */
  function setupRun(status: string) {
    const tournamentUpdate = vi.fn().mockReturnValue({
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
        if (table === "tournaments") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: "t1", format: "round_robin", status },
                    error: null,
                  }),
              }),
            }),
            update: tournamentUpdate,
          };
        }
        if (table === "participants") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  not: () => ({
                    order: () => ({
                      order: () =>
                        Promise.resolve({
                          data: [
                            { id: "p1", seed: 1, created_at: "2026-08-12T09:00:00Z" },
                            { id: "p2", seed: 2, created_at: "2026-08-12T09:01:00Z" },
                          ],
                          error: null,
                        }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "matches") {
          return {
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
            // Ein INSERT ohne .select(): die ids vergibt der Client selbst.
            insert: () => Promise.resolve({ error: null }),
          };
        }
        return {};
      }),
    };
    return { tournamentUpdate };
  }

  it("leaves a finished tournament finished", async () => {
    const { tournamentUpdate } = setupRun("finished");
    const { generateBracket } = await import("./actions");

    expect(await generateBracket("t1", { discardResults: true })).toEqual({
      ok: true,
    });
    expect(tournamentUpdate).not.toHaveBeenCalled();
  });

  it("does not rewrite the status of an already running tournament", async () => {
    const { tournamentUpdate } = setupRun("running");
    const { generateBracket } = await import("./actions");

    expect(await generateBracket("t1", { discardResults: true })).toEqual({
      ok: true,
    });
    expect(tournamentUpdate).not.toHaveBeenCalled();
  });

  it("still starts a tournament that is still open for registration", async () => {
    const { tournamentUpdate } = setupRun("registration");
    const { generateBracket } = await import("./actions");

    expect(await generateBracket("t1", { discardResults: true })).toEqual({
      ok: true,
    });
    expect(tournamentUpdate).toHaveBeenCalledWith({ status: "running" });
  });
});
