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
  // Seit 20260811110000 laeuft alles Loeschende und Konfigurierende ueber
  // requireOrganizerOrAdmin. Beide zeigen hier auf dasselbe Ergebnis: die Tests
  // pruefen das Verhalten der Action, nicht die Rollenzuordnung — die steckt in
  // der Policy und ist in der Datenbank belegt.
  requireOrganizerOrAdmin: () => Promise.resolve(requireStaffResult),
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
  /**
   * Mock the two head-counts (matches, participants) plus the tournaments row.
   * Defaults: no matches, no participants, update succeeds with one row.
   */
  function setupUpdate(
    opts: {
      matches?: { count: number | null; error?: unknown };
      participants?: { count: number | null; error?: unknown };
      currentTeamSize?: number | null;
      update?: { error: unknown; count: number | null };
    } = {},
  ) {
    const captured: { patch?: Record<string, unknown> } = {};
    const headCount = (r?: { count: number | null; error?: unknown }) => ({
      select: () => ({
        eq: () => Promise.resolve({ count: r?.count ?? 0, error: r?.error ?? null }),
      }),
    });
    setupStaff((table: string) => {
      if (table === "matches") return headCount(opts.matches);
      if (table === "participants") return headCount(opts.participants);
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    opts.currentTeamSize === undefined || opts.currentTeamSize === null
                      ? null
                      : { team_size: opts.currentTeamSize },
                  error: null,
                }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            captured.patch = patch;
            return { eq: () => Promise.resolve(opts.update ?? { error: null, count: 1 }) };
          },
        };
      }
      return {};
    });
    return captured;
  }

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
    setupUpdate({ matches: { count: null, error: { code: "08006", message: "timeout" } } });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Turnier konnte nicht aktualisiert werden." });
  });

  // (6b) Same for the participants count — it decides the team-size lock
  it("returns friendly error when participants count query fails", async () => {
    setupUpdate({ participants: { count: null, error: { code: "08006", message: "timeout" } } });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Turnier konnte nicht aktualisiert werden." });
  });

  // (7) Successful update with no existing matches returns { ok: true }
  it("returns ok:true when update succeeds", async () => {
    setupUpdate();
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ ok: true });
  });

  // (8) Zero-count silent-success — RLS blocked the write without error
  it("returns error when 0 rows were updated (RLS silent block)", async () => {
    setupUpdate({ update: { error: null, count: 0 } });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Turnier nicht gefunden oder keine Berechtigung." });
  });

  // (9) DB error returns friendly message
  it("returns friendly error when update fails", async () => {
    setupUpdate({ update: { error: { code: "08006", message: "fail" }, count: null } });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament(validUpdateInput);
    expect(result).toEqual({ error: "Turnier konnte nicht gespeichert werden." });
  });

  // (10) Team size is locked once anybody is registered. Der Teilnehmer-Typ
  // ('solo'/'player') haengt an der Teamgroesse zum Zeitpunkt der Anmeldung und
  // laesst sich danach nicht mehr korrigieren — ein spaeterer Wechsel mischt
  // Teams und Einzelspieler im selben Baum.
  it("rejects a team size change while participants exist", async () => {
    setupUpdate({ participants: { count: 3 }, currentTeamSize: 1 });
    const { updateTournament } = await import("./actions");
    const { TEAM_SIZE_LOCKED } = await import("@/lib/tournament/lifecycle");
    const result = await updateTournament({ ...validUpdateInput, teamSize: 5 });
    expect(result).toEqual({ error: TEAM_SIZE_LOCKED });
    expect(TEAM_SIZE_LOCKED).toMatch(/Teamgröße/);
  });

  // (10b) Unchanged team size saves fine — the lock guards the value, not the form
  it("saves other fields when the team size is unchanged", async () => {
    const captured = setupUpdate({ participants: { count: 3 }, currentTeamSize: 2 });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament({ ...validUpdateInput, teamSize: 2 });
    expect(result).toEqual({ ok: true });
    expect(captured.patch).not.toHaveProperty("team_size");
    expect(captured.patch?.name).toBe("Winter Cup Updated");
  });

  // (10c) Without participants the team size still changes
  it("writes a new team size while nobody is registered", async () => {
    const captured = setupUpdate({ participants: { count: 0 } });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament({ ...validUpdateInput, teamSize: 5 });
    expect(result).toEqual({ ok: true });
    expect(captured.patch?.team_size).toBe(5);
  });

  // (10d) Participants exist but the tournament row is unreadable (RLS)
  it("errors when the current team size cannot be read", async () => {
    setupUpdate({ participants: { count: 3 }, currentTeamSize: null });
    const { updateTournament } = await import("./actions");
    const result = await updateTournament({ ...validUpdateInput, teamSize: 5 });
    expect(result).toEqual({ error: "Turnier nicht gefunden oder keine Berechtigung." });
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
      error:
        "Ein laufendes Turnier kann nicht gelöscht werden. Beende es zuerst oder archiviere es.",
    });
  });

  // (4) A finished tournament IS deletable — refusing it left every past
  // tournament stuck in the organizer list with no way to remove it.
  it("deletes a finished tournament and returns ok:true", async () => {
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
    expect(result).toEqual({ ok: true });
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

// ── setTournamentArchived ─────────────────────────────────────────────────────

describe("setTournamentArchived", () => {
  /** Mock the status lookup plus the update, capturing what was written. */
  function setupTournament(
    status: string,
    updateResult: { error: unknown } = { error: null },
  ) {
    const captured: { payload?: Record<string, unknown> } = {};
    setupStaff((table: string) => {
      if (table !== "tournaments") return {};
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { status }, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          captured.payload = payload;
          return { eq: () => Promise.resolve(updateResult) };
        },
      };
    });
    return captured;
  }

  beforeEach(() => {
    mockRedirect.mockReset();
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { setTournamentArchived } = await import("./actions");
    expect(await setTournamentArchived("t-1", true)).toEqual({
      error: "Nicht angemeldet.",
    });
  });

  it("errors when the tournament is missing or RLS hides it", async () => {
    setupStaff((table: string) => {
      if (table !== "tournaments") return {};
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      };
    });
    const { setTournamentArchived } = await import("./actions");
    expect(await setTournamentArchived("t-1", true)).toEqual({
      error: "Turnier nicht gefunden oder keine Berechtigung.",
    });
  });

  it("archives a finished tournament by stamping archived_at", async () => {
    const captured = setupTournament("finished");
    const { setTournamentArchived } = await import("./actions");
    expect(await setTournamentArchived("t-1", true)).toEqual({ ok: true });
    expect(Object.keys(captured.payload!)).toEqual(["archived_at"]);
    expect(typeof captured.payload!.archived_at).toBe("string");
  });

  it("restores by clearing archived_at", async () => {
    const captured = setupTournament("finished");
    const { setTournamentArchived } = await import("./actions");
    expect(await setTournamentArchived("t-1", false)).toEqual({ ok: true });
    expect(captured.payload).toEqual({ archived_at: null });
  });

  it("refuses to archive a tournament that is in play", async () => {
    setupTournament("running");
    const { setTournamentArchived } = await import("./actions");
    expect(await setTournamentArchived("t-1", true)).toEqual({
      error: "Ein laufendes Turnier kann nicht archiviert werden.",
    });
  });

  it("still restores a running tournament — only archiving is guarded", async () => {
    const captured = setupTournament("running");
    const { setTournamentArchived } = await import("./actions");
    expect(await setTournamentArchived("t-1", false)).toEqual({ ok: true });
    expect(captured.payload).toEqual({ archived_at: null });
  });

  it("returns a friendly error when the update fails", async () => {
    setupTournament("finished", { error: { code: "08006", message: "fail" } });
    const { setTournamentArchived } = await import("./actions");
    expect(await setTournamentArchived("t-1", true)).toEqual({
      error: "Turnier konnte nicht archiviert werden.",
    });
  });
});
