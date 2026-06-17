/**
 * Unit tests for participants/actions.ts server actions.
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

// ── updateParticipant ─────────────────────────────────────────────────────────

describe("updateParticipant", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("rejects an empty displayName", async () => {
    const { updateParticipant } = await import("./actions");
    const result = await updateParticipant("p1", "t1", "   ", null);
    expect(result).toEqual({ error: "Anzeigename ist erforderlich." });
  });

  it("rejects a displayName that is only whitespace", async () => {
    const { updateParticipant } = await import("./actions");
    const result = await updateParticipant("p1", "t1", "\t", null);
    expect(result).toEqual({ error: "Anzeigename ist erforderlich." });
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { updateParticipant } = await import("./actions");
    const result = await updateParticipant("p1", "t1", "Alice", null);
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns not-found error when zero rows are affected", async () => {
    setupStaff((table: string) => {
      if (table === "participants") {
        return {
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null, count: 0 }),
            }),
          }),
        };
      }
      return {};
    });
    const { updateParticipant } = await import("./actions");
    const result = await updateParticipant("p1", "t1", "Alice", null);
    expect(result).toEqual({ error: "Teilnehmer wurde nicht gefunden oder bereits gelöscht." });
  });

  it("returns ok when update succeeds", async () => {
    setupStaff((table: string) => {
      if (table === "participants") {
        return {
          update: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null, count: 1 }),
            }),
          }),
        };
      }
      return {};
    });
    const { updateParticipant } = await import("./actions");
    const result = await updateParticipant("p1", "t1", "Alice", "AliceGG");
    expect(result).toEqual({ ok: true });
  });

  it("propagates DB error from update", async () => {
    setupStaff((table: string) => {
      if (table === "participants") {
        return {
          update: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  error: { code: "08006", message: "connection failure" },
                  count: null,
                }),
            }),
          }),
        };
      }
      return {};
    });
    const { updateParticipant } = await import("./actions");
    const result = await updateParticipant("p1", "t1", "Alice", null);
    expect(result).toEqual({ error: "Teilnehmer konnte nicht gespeichert werden." });
  });
});

// ── removeParticipant ─────────────────────────────────────────────────────────

describe("removeParticipant", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { removeParticipant } = await import("./actions");
    const result = await removeParticipant("p1", "t1");
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns not-found error when zero rows are deleted", async () => {
    setupStaff((table: string) => {
      if (table === "participants") {
        return {
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null, count: 0 }),
            }),
          }),
        };
      }
      return {};
    });
    const { removeParticipant } = await import("./actions");
    const result = await removeParticipant("p1", "t1");
    expect(result).toEqual({ error: "Teilnehmer wurde nicht gefunden." });
  });

  it("returns ok when delete succeeds", async () => {
    setupStaff((table: string) => {
      if (table === "participants") {
        return {
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: null, count: 1 }),
            }),
          }),
        };
      }
      return {};
    });
    const { removeParticipant } = await import("./actions");
    const result = await removeParticipant("p1", "t1");
    expect(result).toEqual({ ok: true });
  });

  it("propagates DB error from delete", async () => {
    setupStaff((table: string) => {
      if (table === "participants") {
        return {
          delete: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  error: { code: "08006", message: "connection failure" },
                  count: null,
                }),
            }),
          }),
        };
      }
      return {};
    });
    const { removeParticipant } = await import("./actions");
    const result = await removeParticipant("p1", "t1");
    expect(result).toEqual({ error: "Teilnehmer konnte nicht entfernt werden." });
  });
});
