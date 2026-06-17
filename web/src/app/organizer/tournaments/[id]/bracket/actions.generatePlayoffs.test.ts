/**
 * Unit tests for the generatePlayoffs server action.
 *
 * Mocks @/lib/supabase/server so no real Supabase connection is needed.
 * The "use server" directive is harmless in the test environment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ────────────────────────────────────────────────────────────

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

// Build a chainable Supabase query builder stub.
function makeQueryBuilder(resolveWith: unknown) {
  const stub: Record<string, unknown> = {};
  const chain = (returnValue: unknown = stub) =>
    new Proxy(stub, {
      get(_, prop: string) {
        if (prop === "then") return undefined; // not a thenable
        return (..._args: unknown[]) => {
          // terminal selectors return a promise
          if (prop === "maybeSingle" || prop === "select") {
            return Promise.resolve(resolveWith);
          }
          return chain(returnValue);
        };
      },
    });
  return chain();
}

let mockClient: MockClient;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockClient),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock match row for group stage. */
function groupMatch(overrides: Partial<{
  group_no: number | null;
  status: string;
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
}> = {}) {
  return {
    group_no: 0,
    status: "done",
    participant_a_id: "pA",
    participant_b_id: "pB",
    score_a: 2,
    score_b: 1,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("generatePlayoffs action", () => {
  beforeEach(() => {
    // Reset mock client before each test.
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user1" } },
        }),
      },
      from: vi.fn(),
    };
  });

  function setupFromChain(
    tournament: unknown,
    profile: unknown,
    matches: unknown,
  ) {
    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: profile, error: null }),
            }),
          }),
        };
      }
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: tournament, error: null }),
            }),
          }),
        };
      }
      if (table === "matches") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: matches, error: null }),
          }),
        };
      }
      return {};
    });
  }

  it("returns error when user is not authenticated", async () => {
    mockClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
    });
    mockClient.from = vi.fn();
    const { generatePlayoffs } = await import("./actions");
    const result = await generatePlayoffs("t1");
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns error when user role is not staff", async () => {
    mockClient.from = vi.fn().mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { role: "viewer" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const { generatePlayoffs } = await import("./actions");
    const result = await generatePlayoffs("t1");
    expect(result).toEqual({ error: "Diese Aktion ist nicht erlaubt." });
  });

  it("returns error when tournament format is not groups_playoffs", async () => {
    setupFromChain(
      { id: "t1", format: "single_elim" },
      { role: "organizer" },
      [],
    );
    const { generatePlayoffs } = await import("./actions");
    const result = await generatePlayoffs("t1");
    expect(result).toEqual({
      error: "Nur für Gruppen → Playoffs verfügbar.",
    });
  });

  it("returns error when no group matches exist (group stage not generated)", async () => {
    setupFromChain(
      { id: "t1", format: "groups_playoffs" },
      { role: "organizer" },
      [], // no matches at all
    );
    const { generatePlayoffs } = await import("./actions");
    const result = await generatePlayoffs("t1");
    expect(result).toEqual({ error: "Erst die Gruppenphase generieren." });
  });

  it("returns error when playoff matches already exist", async () => {
    setupFromChain(
      { id: "t1", format: "groups_playoffs" },
      { role: "organizer" },
      [
        groupMatch({ group_no: 0, status: "done" }), // group match
        groupMatch({ group_no: null, status: "pending" }), // playoff match
      ],
    );
    const { generatePlayoffs } = await import("./actions");
    const result = await generatePlayoffs("t1");
    expect(result).toEqual({
      error: "Die Playoffs wurden bereits ausgelost.",
    });
  });

  it("returns error when group stage is not fully complete", async () => {
    setupFromChain(
      { id: "t1", format: "groups_playoffs" },
      { role: "organizer" },
      [
        groupMatch({ group_no: 0, status: "done" }),
        groupMatch({ group_no: 0, status: "pending" }), // still pending
      ],
    );
    const { generatePlayoffs } = await import("./actions");
    const result = await generatePlayoffs("t1");
    expect(result).toEqual({
      error: "Die Gruppenphase ist noch nicht abgeschlossen.",
    });
  });

  it("returns error when too few advancers can be seeded", async () => {
    // Single group with only one done match; computeStandings returns 2 participants
    // but seedPlayoffAdvancers with ADVANCE_PER_GROUP=2 and 1 group → 2 seeded → ok
    // We need a case where seeded.length < 2: single group, one participant
    setupFromChain(
      { id: "t1", format: "groups_playoffs" },
      { role: "organizer" },
      [
        // 1 group match with only one real participant (the other is null)
        groupMatch({
          group_no: 0,
          status: "done",
          participant_a_id: "pA",
          participant_b_id: null,
          score_a: 2,
          score_b: 0,
        }),
      ],
    );
    const { generatePlayoffs } = await import("./actions");
    const result = await generatePlayoffs("t1");
    // With only 1 participant in standings, seedPlayoffAdvancers returns 1 seeded → error
    expect(result).toEqual({
      error: "Zu wenige Teilnehmer für die Playoffs.",
    });
  });
});
