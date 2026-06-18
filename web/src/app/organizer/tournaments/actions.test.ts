/**
 * Unit tests for the tournaments/actions.ts server actions.
 *
 * Mocks @/lib/auth/staff so no real Supabase connection is needed.
 * Mocks next/navigation so redirect() does not throw in the test environment.
 * The "use server" directive is harmless in the test environment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only so it doesn't blow up in jsdom ──────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock next/navigation so redirect() is a no-op spy ────────────────────────
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// ── Mock @/lib/auth/staff ─────────────────────────────────────────────────────

type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
};

let mockSupabase: MockSupabase;
let requireStaffResult:
  | { supabase: MockSupabase; userId: string; orgId: string | null }
  | { error: string };

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: () => Promise.resolve(requireStaffResult),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Configure requireStaff to succeed with an org context. */
function setupStaff(fromImpl: (table: string) => unknown, orgId: string | null = "org-1") {
  mockSupabase = { from: vi.fn().mockImplementation(fromImpl) };
  requireStaffResult = { supabase: mockSupabase, userId: "user-abc", orgId };
}

/** Minimal valid input for createTournament. */
const validInput = {
  name: "Winter Cup",
  gameId: "game-1",
  format: "single_elim",
  mode: "lan",
  teamSize: 2,
  startsAt: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createTournament", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    setupStaff(() => ({}));
  });

  // (1) Auth error propagation
  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { createTournament } = await import("./actions");
    const result = await createTournament(validInput);
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  // (2) orgId null returns org-context error
  it("returns org-context error when orgId is null", async () => {
    setupStaff(() => ({}), null);
    const { createTournament } = await import("./actions");
    const result = await createTournament(validInput);
    expect(result).toEqual({
      error: "Kein Org-Kontext — dein Account ist keiner Organisation zugeordnet.",
    });
  });

  // (3) Input validation — empty name
  it("rejects an empty name", async () => {
    const { createTournament } = await import("./actions");
    const result = await createTournament({ ...validInput, name: "   " });
    expect(result).toEqual({ error: "Name ist erforderlich." });
  });

  // (3) Input validation — invalid format
  it("rejects an invalid format", async () => {
    const { createTournament } = await import("./actions");
    const result = await createTournament({ ...validInput, format: "invalid_format" });
    expect(result).toEqual({ error: "Ungültiges Format." });
  });

  // (3) Input validation — invalid mode
  it("rejects an invalid mode", async () => {
    const { createTournament } = await import("./actions");
    const result = await createTournament({ ...validInput, mode: "invisible" });
    expect(result).toEqual({ error: "Ungültiger Modus." });
  });

  // (3) Input validation — teamSize < 1
  it("rejects teamSize of 0", async () => {
    const { createTournament } = await import("./actions");
    const result = await createTournament({ ...validInput, teamSize: 0 });
    expect(result).toEqual({ error: "Teamgröße muss mindestens 1 sein." });
  });

  // (3) Input validation — negative teamSize
  it("rejects a negative teamSize", async () => {
    const { createTournament } = await import("./actions");
    const result = await createTournament({ ...validInput, teamSize: -1 });
    expect(result).toEqual({ error: "Teamgröße muss mindestens 1 sein." });
  });

  // (3) Input validation — float teamSize
  it("rejects a float teamSize", async () => {
    const { createTournament } = await import("./actions");
    const result = await createTournament({ ...validInput, teamSize: 1.5 });
    expect(result).toEqual({ error: "Teamgröße muss mindestens 1 sein." });
  });

  // (4) Successful insert redirects to the new tournament's page
  it("redirects to the new tournament on success", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: "t-99" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const { createTournament } = await import("./actions");
    await createTournament(validInput);
    expect(mockRedirect).toHaveBeenCalledWith("/organizer/tournaments/t-99");
  });

  // (4) Successful insert uses userId from requireStaff (no second getUser call)
  it("inserts created_by from requireStaff userId without an extra auth call", async () => {
    let capturedRow: Record<string, unknown> | undefined;
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          insert: (row: Record<string, unknown>) => {
            capturedRow = row;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "t-99" }, error: null }),
              }),
            };
          },
        };
      }
      return {};
    });
    const { createTournament } = await import("./actions");
    await createTournament(validInput);
    expect(capturedRow?.created_by).toBe("user-abc");
    expect(capturedRow?.org_id).toBe("org-1");
  });

  // (5) DB error returns friendly message
  it("returns friendly error when insert fails", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: { code: "08006", message: "connection failure" },
                }),
            }),
          }),
        };
      }
      return {};
    });
    const { createTournament } = await import("./actions");
    const result = await createTournament(validInput);
    expect(result).toEqual({ error: "Turnier konnte nicht angelegt werden." });
  });
});

// ── updateTournament ──────────────────────────────────────────────────────────

/** Minimal valid input for updateTournament. */
const validUpdateInput = {
  id: "t-1",
  name: "Winter Cup Updated",
  gameId: "game-1",
  format: "single_elim",
  mode: "lan",
  teamSize: 2,
  startsAt: null,
};

describe("updateTournament", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    setupStaff(() => ({}));
  });

  // (1) Auth error propagation
  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  // (2) Input validation — empty name
  it("rejects an empty name", async () => {
    const { updateTournament } = await import("./actions");
    const result = await updateTournament({ ...validUpdateInput, name: "   " });
    expect(result).toEqual({ error: "Name ist erforderlich." });
  });

  // (3) Input validation — invalid format
  it("rejects an invalid format", async () => {
    const { updateTournament } = await import("./actions");
    const result = await updateTournament({ ...validUpdateInput, format: "bad_format" });
    expect(result).toEqual({ error: "Ungültiges Format." });
  });

  // (4) Input validation — invalid mode
  it("rejects an invalid mode", async () => {
    const { updateTournament } = await import("./actions");
    const result = await updateTournament({ ...validUpdateInput, mode: "unknown" });
    expect(result).toEqual({ error: "Ungültiger Modus." });
  });

  // (5) Input validation — teamSize < 1
  it("rejects teamSize of 0", async () => {
    const { updateTournament } = await import("./actions");
    const result = await updateTournament({ ...validUpdateInput, teamSize: 0 });
    expect(result).toEqual({ error: "Teamgröße muss mindestens 1 sein." });
  });

  // (6) Matches count query error returns friendly message
  it("returns friendly error when matches count query fails", async () => {
    setupStaff((table: string) => {
      if (table === "matches") {
        return {
          select: () => ({
            count: "exact",
            head: true,
            eq: () => Promise.resolve({ count: null, error: { code: "08006", message: "timeout" } }),
          }),
        };
      }
      return {};
    });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Turnier konnte nicht aktualisiert werden." });
  });

  // (7) Successful update with no existing matches returns { ok: true }
  it("returns ok:true when update succeeds", async () => {
    setupStaff((table: string) => {
      if (table === "matches") {
        return {
          select: () => ({
            count: "exact",
            head: true,
            eq: () => Promise.resolve({ count: 0, error: null }),
          }),
        };
      }
      if (table === "tournaments") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null, count: 1 }),
          }),
        };
      }
      return {};
    });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ ok: true });
  });

  // (8) Zero-count silent-success — RLS blocked the write without error
  it("returns error when 0 rows were updated (RLS silent block)", async () => {
    setupStaff((table: string) => {
      if (table === "matches") {
        return {
          select: () => ({
            count: "exact",
            head: true,
            eq: () => Promise.resolve({ count: 0, error: null }),
          }),
        };
      }
      if (table === "tournaments") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null, count: 0 }),
          }),
        };
      }
      return {};
    });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Turnier nicht gefunden oder keine Berechtigung." });
  });

  // (9) DB error returns friendly message
  it("returns friendly error when update fails", async () => {
    setupStaff((table: string) => {
      if (table === "matches") {
        return {
          select: () => ({
            count: "exact",
            head: true,
            eq: () => Promise.resolve({ count: 0, error: null }),
          }),
        };
      }
      if (table === "tournaments") {
        return {
          update: () => ({
            eq: () =>
              Promise.resolve({ error: { code: "08006", message: "fail" }, count: null }),
          }),
        };
      }
      return {};
    });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Turnier konnte nicht gespeichert werden." });
  });
});

// ── advanceStatus ─────────────────────────────────────────────────────────────

describe("advanceStatus", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    setupStaff(() => ({}));
  });

  // (1) Auth error propagation
  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { advanceStatus } = await import("./actions");
    const result = await advanceStatus("t-1", "draft");
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  // (2) No valid next status returns error
  it("returns error when there is no valid next status", async () => {
    const { advanceStatus } = await import("./actions");
    const result = await advanceStatus("t-1", "finished");
    expect(result).toEqual({ error: "Kein gültiger nächster Status." });
  });

  // (3) draft -> registration succeeds with count 1
  it("advances draft to registration and returns ok:true", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
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
    const { advanceStatus } = await import("./actions");
    const result = await advanceStatus("t-1", "draft");
    expect(result).toEqual({ ok: true });
  });

  // (4) Zero count means status was already changed (optimistic guard)
  it("returns error when 0 rows updated (status already moved)", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
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
    const { advanceStatus } = await import("./actions");
    const result = await advanceStatus("t-1", "draft");
    expect(result).toEqual({ error: "Status wurde bereits geändert." });
  });

  // (5) DB error returns friendly message
  it("returns friendly error when update fails", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          update: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({ error: { code: "08006", message: "fail" }, count: null }),
            }),
          }),
        };
      }
      return {};
    });
    const { advanceStatus } = await import("./actions");
    const result = await advanceStatus("t-1", "draft");
    expect(result).toEqual({ error: "Status konnte nicht geändert werden." });
  });
});

// ── deleteTournament ──────────────────────────────────────────────────────────

describe("deleteTournament", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    setupStaff(() => ({}));
  });

  // (1) Auth error propagation
  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { deleteTournament } = await import("./actions");
    const result = await deleteTournament("t-1");
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  // (2) SELECT returns null (not found or RLS-blocked) — must return an error, not { ok: true }
  it("returns error when tournament is not found or RLS blocks the read", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: { code: "PGRST116", message: "no rows" } }),
            }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    });
    const { deleteTournament } = await import("./actions");
    const result = await deleteTournament("t-1");
    expect(result).toEqual({ error: "Turnier nicht gefunden oder keine Berechtigung." });
  });

  // (3) Running tournament cannot be deleted
  it("rejects deletion of a running tournament", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { status: "running" }, error: null }),
            }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    });
    const { deleteTournament } = await import("./actions");
    const result = await deleteTournament("t-1");
    expect(result).toEqual({
      error: "Laufende oder beendete Turniere können nicht gelöscht werden.",
    });
  });

  // (4) Finished tournament cannot be deleted
  it("rejects deletion of a finished tournament", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { status: "finished" }, error: null }),
            }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    });
    const { deleteTournament } = await import("./actions");
    const result = await deleteTournament("t-1");
    expect(result).toEqual({
      error: "Laufende oder beendete Turniere können nicht gelöscht werden.",
    });
  });

  // (5) Draft tournament is deleted and returns { ok: true }
  it("deletes a draft tournament and returns ok:true", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { status: "draft" }, error: null }),
            }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    });
    const { deleteTournament } = await import("./actions");
    const result = await deleteTournament("t-1");
    expect(result).toEqual({ ok: true });
  });

  // (6) Registration tournament can also be deleted
  it("deletes a registration-phase tournament and returns ok:true", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { status: "registration" }, error: null }),
            }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    });
    const { deleteTournament } = await import("./actions");
    const result = await deleteTournament("t-1");
    expect(result).toEqual({ ok: true });
  });

  // (7) DB error on delete returns friendly message
  it("returns friendly error when delete fails", async () => {
    setupStaff((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { status: "draft" }, error: null }),
            }),
          }),
          delete: () => ({
            eq: () =>
              Promise.resolve({ error: { code: "08006", message: "fail" } }),
          }),
        };
      }
      return {};
    });
    const { deleteTournament } = await import("./actions");
    const result = await deleteTournament("t-1");
    expect(result).toEqual({ error: "Turnier konnte nicht gelöscht werden." });
  });
});
