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
  rpc?: ReturnType<typeof vi.fn>;
};

let mockSupabase: MockSupabase;
let requireStaffResult: { supabase: MockSupabase; orgId: string | null } | { error: string };

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: () => Promise.resolve(requireStaffResult),
  requireOrganizerOrAdmin: () => Promise.resolve(requireStaffResult),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Configure requireStaff to succeed and set up the supabase.from mock. */
function setupStaff(fromImpl: (table: string) => unknown) {
  mockSupabase = { from: vi.fn().mockImplementation(fromImpl) };
  requireStaffResult = { supabase: mockSupabase, orgId: "org-1" };
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

// ── addParticipant ────────────────────────────────────────────────────────────

/**
 * Wire up the tournaments lookup + participants insert that addParticipant
 * walks through, plus the check_in RPC.
 */
function setupAdd(options?: {
  teamSize?: number | null;
  tournamentMissing?: boolean;
  insertError?: { code: string; message: string };
  checkInError?: { code: string; message: string };
}) {
  const insert = vi.fn().mockReturnValue({
    select: () => ({
      single: () =>
        Promise.resolve(
          options?.insertError
            ? { data: null, error: options.insertError }
            : { data: { id: "p-new" }, error: null },
        ),
    }),
  });
  const rpc = vi
    .fn()
    .mockResolvedValue({ error: options?.checkInError ?? null });

  setupStaff((table: string) => {
    if (table === "tournaments") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: options?.tournamentMissing
                  ? null
                  : { id: "t1", team_size: options?.teamSize ?? 1 },
              }),
          }),
        }),
      };
    }
    if (table === "participants") return { insert };
    return {};
  });
  mockSupabase.rpc = rpc;
  return { insert, rpc };
}

describe("addParticipant", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Luuk", "2013-04-10", null);
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  it("rejects an empty displayName", async () => {
    setupAdd();
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "  ", "2013-04-10", null);
    expect(result).toEqual({ error: "Anzeigename ist erforderlich." });
  });

  it("rejects a missing or impossible birthdate", async () => {
    setupAdd();
    const { addParticipant } = await import("./actions");
    expect(await addParticipant("t1", "Luuk", "", null)).toEqual({
      error: "Bitte ein gültiges Geburtsdatum eingeben.",
    });
    expect(await addParticipant("t1", "Luuk", "2013-02-31", null)).toEqual({
      error: "Bitte ein gültiges Geburtsdatum eingeben.",
    });
  });

  it("reports a missing tournament", async () => {
    setupAdd({ tournamentMissing: true });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Luuk", "2013-04-10", null);
    expect(result).toEqual({ error: "Turnier wurde nicht gefunden." });
  });

  it("inserts a checked-in walk-in without an account", async () => {
    const { insert, rpc } = setupAdd();
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", " Luuk ", "2013-04-10", " LK ");

    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      tournament_id: "t1",
      user_id: null,
      type: "solo",
      display_name: "Luuk",
      gamertag: "LK",
      birthdate: "2013-04-10",
    });
    expect(rpc).toHaveBeenCalledWith("check_in", {
      p_participant_id: "p-new",
      p_method: "manual",
    });
  });

  it("uses the team type when the tournament is not solo", async () => {
    const { insert } = setupAdd({ teamSize: 2 });
    const { addParticipant } = await import("./actions");
    await addParticipant("t1", "Team Rakete", "2013-04-10", null);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: "team", gamertag: null }),
    );
  });

  it("propagates DB error from insert", async () => {
    setupAdd({ insertError: { code: "08006", message: "connection failure" } });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Luuk", "2013-04-10", null);
    expect(result).toEqual({ error: "Teilnehmer konnte nicht angelegt werden." });
  });

  it("says the participant exists when only the check-in failed", async () => {
    setupAdd({ checkInError: { code: "P0001", message: "nope" } });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Luuk", "2013-04-10", null);
    expect(result).toEqual({
      error:
        "Luuk wurde angelegt, aber der Check-in ist fehlgeschlagen. " +
        "Bitte in der Teilnehmerliste manuell einchecken.",
    });
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
