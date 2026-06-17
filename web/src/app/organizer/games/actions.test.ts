/**
 * Unit tests for the games/actions.ts server actions.
 *
 * Mocks @/lib/auth/staff so no real Supabase connection is needed.
 * The "use server" directive is harmless in the test environment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only so it doesn't blow up in jsdom ──────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock @/lib/auth/staff ─────────────────────────────────────────────────────

type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
};

let mockSupabase: MockSupabase;
let requireStaffResult: { supabase: MockSupabase } | { error: string };

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: () => Promise.resolve(requireStaffResult),
  requireOrganizerOrAdmin: () => Promise.resolve(requireStaffResult),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Configure requireStaff to succeed and set up the supabase.from mock. */
function setupStaff(fromImpl: (table: string) => unknown) {
  mockSupabase = { from: vi.fn().mockImplementation(fromImpl) };
  requireStaffResult = { supabase: mockSupabase };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createGame", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("rejects an empty name", async () => {
    const { createGame } = await import("./actions");
    const result = await createGame("  ", 2);
    expect(result).toEqual({ error: "Name ist erforderlich." });
  });

  it("rejects teamSize of 0", async () => {
    const { createGame } = await import("./actions");
    const result = await createGame("Darts", 0);
    expect(result).toEqual({ error: "Teamgröße ≥ 1." });
  });

  it("rejects a negative teamSize", async () => {
    const { createGame } = await import("./actions");
    const result = await createGame("Darts", -1);
    expect(result).toEqual({ error: "Teamgröße ≥ 1." });
  });

  it("rejects a float teamSize", async () => {
    const { createGame } = await import("./actions");
    const result = await createGame("Darts", 1.5);
    expect(result).toEqual({ error: "Teamgröße ≥ 1." });
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { createGame } = await import("./actions");
    const result = await createGame("Darts", 2);
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns ok when insert succeeds", async () => {
    setupStaff((table: string) => {
      if (table === "games") {
        return {
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    });
    const { createGame } = await import("./actions");
    const result = await createGame("Darts", 2);
    expect(result).toEqual({ ok: true });
  });

  it("returns friendly error when insert fails", async () => {
    setupStaff((table: string) => {
      if (table === "games") {
        return {
          insert: () =>
            Promise.resolve({
              error: { code: "08006", message: "connection failure" },
            }),
        };
      }
      return {};
    });
    const { createGame } = await import("./actions");
    const result = await createGame("Darts", 2);
    expect(result).toEqual({ error: "Spiel konnte nicht angelegt werden." });
  });
});

describe("updateGame", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("rejects an empty name", async () => {
    const { updateGame } = await import("./actions");
    const result = await updateGame("g1", "", 2);
    expect(result).toEqual({ error: "Name ist erforderlich." });
  });

  it("rejects teamSize < 1", async () => {
    const { updateGame } = await import("./actions");
    const result = await updateGame("g1", "Tischtennis", 0);
    expect(result).toEqual({ error: "Teamgröße ≥ 1." });
  });

  it("rejects a float teamSize", async () => {
    const { updateGame } = await import("./actions");
    const result = await updateGame("g1", "Tischtennis", 2.9);
    expect(result).toEqual({ error: "Teamgröße ≥ 1." });
  });

  it("returns not-found error when zero rows are affected (game concurrently deleted)", async () => {
    setupStaff((table: string) => {
      if (table === "games") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null, count: 0 }),
          }),
        };
      }
      return {};
    });
    const { updateGame } = await import("./actions");
    const result = await updateGame("g1", "Tischtennis", 2);
    expect(result).toEqual({
      error: "Spiel wurde nicht gefunden oder bereits gelöscht.",
    });
  });

  it("returns ok when update succeeds", async () => {
    setupStaff((table: string) => {
      if (table === "games") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null, count: 1 }),
          }),
        };
      }
      return {};
    });
    const { updateGame } = await import("./actions");
    const result = await updateGame("g1", "Tischtennis", 2);
    expect(result).toEqual({ ok: true });
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { updateGame } = await import("./actions");
    const result = await updateGame("g1", "Tischtennis", 2);
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });
});

describe("deleteGame", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("returns usage error when the game is referenced by tournaments", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({ count: 2, error: null }),
          }),
        };
      }
      return {};
    });
    const { deleteGame } = await import("./actions");
    const result = await deleteGame("g1");
    expect(result).toEqual({
      error: "Spiel wird von 2 Turnier(en) genutzt und kann nicht gelöscht werden.",
    });
  });

  it("returns friendly error when the count query itself fails", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                count: null,
                error: { code: "08006", message: "connection failure" },
              }),
          }),
        };
      }
      return {};
    });
    const { deleteGame } = await import("./actions");
    const result = await deleteGame("g1");
    // Non-PG-code error → fallback message
    expect(result).toEqual({ error: "Prüfung fehlgeschlagen." });
  });

  it("returns FK-specific message when DELETE hits a 23503 constraint", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ count: 0, error: null }),
          }),
        };
      }
      if (table === "games") {
        return {
          delete: () => ({
            eq: () =>
              Promise.resolve({
                error: { code: "23503", message: "foreign key violation" },
              }),
          }),
        };
      }
      return {};
    });
    const { deleteGame } = await import("./actions");
    const result = await deleteGame("g1");
    expect(result).toEqual({
      error: "Spiel wird noch von einem Turnier genutzt und kann nicht gelöscht werden.",
    });
  });

  it("returns ok when game is deleted successfully", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ count: 0, error: null }),
          }),
        };
      }
      if (table === "games") {
        return {
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      return {};
    });
    const { deleteGame } = await import("./actions");
    const result = await deleteGame("g1");
    expect(result).toEqual({ ok: true });
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { deleteGame } = await import("./actions");
    const result = await deleteGame("g1");
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });
});
