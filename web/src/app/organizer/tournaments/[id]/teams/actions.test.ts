/**
 * Unit tests fuer teams/actions.ts.
 *
 * Wie in participants/actions.test.ts wird @/lib/auth/staff gemockt, damit kein
 * echter Supabase-Client noetig ist, und die Actions werden INNERHALB des Tests
 * per await import geladen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type MockSupabase = { from: ReturnType<typeof vi.fn> };

let mockSupabase: MockSupabase;
let requireStaffResult: { supabase: MockSupabase; orgId: string | null } | { error: string };

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: () => Promise.resolve(requireStaffResult),
  // Seit 20260811110000 laeuft alles Loeschende und Konfigurierende ueber
  // requireOrganizerOrAdmin. Beide zeigen hier auf dasselbe Ergebnis: die Tests
  // pruefen das Verhalten der Action, nicht die Rollenzuordnung — die steckt in
  // der Policy und ist in der Datenbank belegt.
  requireOrganizerOrAdmin: () => Promise.resolve(requireStaffResult),
}));

// setTeamReady reicht nur an den vorhandenen manuellen Check-in durch — hier
// zaehlt, DASS es der ist, nicht was er tut.
const manualCheckIn = vi.fn().mockResolvedValue({ ok: true });
const resetCheckIn = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../participants/actions", () => ({
  manualCheckIn: (...args: unknown[]) => manualCheckIn(...args),
  resetCheckIn: (...args: unknown[]) => resetCheckIn(...args),
}));

function setupStaff(fromImpl: (table: string) => unknown) {
  mockSupabase = { from: vi.fn().mockImplementation(fromImpl) };
  requireStaffResult = { supabase: mockSupabase, orgId: "org-1" };
}

/**
 * Das Turnier, das saveAssignments vorfindet: zwei Spieler, ein Team, und eine
 * Zeile aus einem fremden Turnier gibt es hier per Definition nicht — die
 * Abfrage ist auf tournament_id eingegrenzt.
 *
 * `teamSize` und `members` gehoeren zum Nachzug am Schluss der Action, die ein
 * durch die Zuordnung vollzaehlig gewordenes Team spielbereit meldet. Standard
 * ist ein Einzelturnier, dort faellt der Nachzug sofort wieder heraus.
 */
function setupAssignments(options?: {
  loadError?: { code: string; message: string };
  updateError?: { code: string; message: string };
  updateCount?: number;
  teamSize?: number;
  members?: { id: string; checked_in_at: string | null }[];
}) {
  const writeResult = {
    error: options?.updateError ?? null,
    count: options?.updateError ? null : (options?.updateCount ?? 1),
  };
  // Ein Kettenglied, das beides kann — weiter verketten und awaited werden:
  // die Zuordnung haengt .eq().eq().eq() an, syncTeamReady .eq().eq().is().
  const update = vi.fn().mockImplementation(() => {
    const chain = {
      eq: () => chain,
      is: () => chain,
      then: (resolve: (v: typeof writeResult) => unknown) => resolve(writeResult),
    };
    return chain;
  });

  setupStaff((table: string) => {
    if (table === "tournaments") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { team_size: options?.teamSize ?? 1 },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table !== "participants") return {};
    return {
      // Nach dem ersten .eq() wartet der Typ-Check auf sein Ergebnis;
      // syncTeamReady haengt ein zweites .eq() an und bekommt die Mitglieder.
      select: () => ({
        eq: () => ({
          eq: () =>
            Promise.resolve({ data: options?.members ?? [], error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            resolve(
              options?.loadError
                ? { data: null, error: options.loadError }
                : {
                    data: [
                      { id: "ada", type: "player" },
                      { id: "bo", type: "player" },
                      { id: "rakete", type: "team" },
                    ],
                    error: null,
                  },
            ),
        }),
      }),
      update,
    };
  });
  return { update };
}

describe("saveAssignments", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("propagates requireStaff auth error", async () => {
    requireStaffResult = { error: "Nicht angemeldet." };
    const { saveAssignments } = await import("./actions");
    expect(await saveAssignments("t1", [{ playerId: "ada", teamId: null }])).toEqual({
      error: "Nicht angemeldet.",
    });
  });

  it("does nothing when there is nothing to change", async () => {
    const { update } = setupAssignments();
    const { saveAssignments } = await import("./actions");
    expect(await saveAssignments("t1", [])).toEqual({ ok: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a player listed twice", async () => {
    const { update } = setupAssignments();
    const { saveAssignments } = await import("./actions");
    const result = await saveAssignments("t1", [
      { playerId: "ada", teamId: "rakete" },
      { playerId: "ada", teamId: null },
    ]);
    expect(result).toEqual({ error: "Ein Spieler kommt in der Zuordnung doppelt vor." });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a player of this tournament", async () => {
    const { update } = setupAssignments();
    const { saveAssignments } = await import("./actions");
    const result = await saveAssignments("t1", [
      { playerId: "geist", teamId: "rakete" },
    ]);
    expect(result).toEqual({ error: "Unbekannter Spieler in der Zuordnung." });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to file a player under another player", async () => {
    // Der Schutz-Trigger verlangt eine Zeile mit type='team' — hier faellt es
    // mit einer lesbaren Meldung auf, statt als rohe DB-Ausnahme.
    const { update } = setupAssignments();
    const { saveAssignments } = await import("./actions");
    const result = await saveAssignments("t1", [{ playerId: "ada", teamId: "bo" }]);
    expect(result).toEqual({ error: "Unbekanntes Team in der Zuordnung." });
    expect(update).not.toHaveBeenCalled();
  });

  it("writes team_id and clears is_captain for every change", async () => {
    const { update } = setupAssignments();
    const { saveAssignments } = await import("./actions");
    const result = await saveAssignments("t1", [
      { playerId: "ada", teamId: "rakete" },
      { playerId: "bo", teamId: null },
    ]);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenNthCalledWith(
      1,
      { team_id: "rakete", is_captain: false },
      { count: "exact" },
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      { team_id: null, is_captain: false },
      { count: "exact" },
    );
  });

  it("meldet ein durch die Zuordnung vollzaehliges Team spielbereit", async () => {
    // Der Trigger sync_team_ready feuert nur bei geaenderter ANWESENHEIT, hier
    // aendert sich nur das Team. Ohne diesen Nachzug bliebe das Zielteam mit
    // checked_in_at NULL stehen und faellt aus dem Bracket, ohne dass irgendwo
    // steht warum — genau daran ist das laufende Turnier zerbrochen.
    const { update } = setupAssignments({
      teamSize: 2,
      members: [
        { id: "ada", checked_in_at: "2026-08-12T09:00:00Z" },
        { id: "bo", checked_in_at: "2026-08-12T09:01:00Z" },
      ],
    });
    const { saveAssignments } = await import("./actions");
    const result = await saveAssignments("t1", [
      { playerId: "ada", teamId: "rakete" },
      { playerId: "bo", teamId: "rakete" },
    ]);

    expect(result).toEqual({ ok: true });
    // Zwei Zuordnungen, danach genau EIN Nachzug: dasselbe Zielteam steht
    // zweimal in `changes` und wird trotzdem nur einmal gemeldet.
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenNthCalledWith(3, {
      checked_in_at: expect.any(String),
    });
  });

  it("laesst ein noch unvollzaehliges Team ungemeldet", async () => {
    const { update } = setupAssignments({
      teamSize: 3,
      members: [{ id: "ada", checked_in_at: "2026-08-12T09:00:00Z" }],
    });
    const { saveAssignments } = await import("./actions");
    expect(
      await saveAssignments("t1", [{ playerId: "ada", teamId: "rakete" }]),
    ).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("zieht nichts nach, wenn nur aus einem Team heraus verschoben wird", async () => {
    // Kein Zielteam, also nichts zu melden — und ein verlassenes Team behaelt
    // seine Freigabe: syncTeamReady meldet nur spielbereit, nimmt nie zurueck.
    const { update } = setupAssignments({ teamSize: 2 });
    const { saveAssignments } = await import("./actions");
    expect(
      await saveAssignments("t1", [{ playerId: "ada", teamId: null }]),
    ).toEqual({ ok: true });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("reports a load failure", async () => {
    setupAssignments({ loadError: { code: "08006", message: "connection failure" } });
    const { saveAssignments } = await import("./actions");
    expect(await saveAssignments("t1", [{ playerId: "ada", teamId: null }])).toEqual({
      error: "Teilnehmer konnten nicht geladen werden.",
    });
  });

  it("reports a row that vanished between load and write", async () => {
    setupAssignments({ updateCount: 0 });
    const { saveAssignments } = await import("./actions");
    expect(await saveAssignments("t1", [{ playerId: "ada", teamId: null }])).toEqual({
      error: "Spieler wurde nicht gefunden.",
    });
  });

  it("propagates a DB error from the update", async () => {
    setupAssignments({ updateError: { code: "42501", message: "rls" } });
    const { saveAssignments } = await import("./actions");
    expect(await saveAssignments("t1", [{ playerId: "ada", teamId: null }])).toEqual({
      error: "Diese Aktion ist nicht erlaubt.",
    });
  });
});

describe("createTeam", () => {
  beforeEach(() => {
    setupStaff(() => ({}));
  });

  it("rejects an empty name", async () => {
    const { createTeam } = await import("./actions");
    expect(await createTeam("t1", "   ")).toEqual({
      error: "Bitte einen Teamnamen angeben.",
    });
  });

  it("inserts a team row with a join code and no user", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    setupStaff((table: string) => (table === "participants" ? { insert } : {}));
    const { createTeam } = await import("./actions");

    expect(await createTeam("t1", "  Team Rakete  ")).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      tournament_id: "t1",
      user_id: null,
      type: "team",
      display_name: "Team Rakete",
    });
    // Sechs Zeichen ohne I, O, 0 und 1 — der Code wird abgelesen.
    expect(row.join_code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("retries on a colliding join code", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "23505", message: "dup" } })
      .mockResolvedValueOnce({ error: null });
    setupStaff((table: string) => (table === "participants" ? { insert } : {}));
    const { createTeam } = await import("./actions");

    expect(await createTeam("t1", "Team Rakete")).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("does not retry on an unrelated DB error", async () => {
    const insert = vi
      .fn()
      .mockResolvedValue({ error: { code: "42501", message: "rls" } });
    setupStaff((table: string) => (table === "participants" ? { insert } : {}));
    const { createTeam } = await import("./actions");

    expect(await createTeam("t1", "Team Rakete")).toEqual({
      error: "Diese Aktion ist nicht erlaubt.",
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("disbandTeam", () => {
  /**
   * participants: delete().eq().eq().eq() — id, tournament_id, type.
   * matches:      select().eq().or().limit().maybeSingle() — der Blick davor.
   */
  function setupDelete(result: {
    error?: unknown;
    count?: number | null;
    inBracket?: boolean;
  }) {
    const del = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => ({
          eq: () =>
            Promise.resolve({
              error: result.error ?? null,
              count: result.count ?? null,
            }),
        }),
      }),
    });
    setupStaff((table: string) => {
      if (table === "participants") return { delete: del };
      if (table === "matches") {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: result.inBracket ? { id: "m-1" } : null,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    return del;
  }

  it("deletes the team row and leaves its members alive", async () => {
    // Die Mitglieder ueberleben ueber den Fremdschluessel (on delete set null),
    // hier darf deshalb genau ein delete stehen — und keines auf die Spieler.
    const del = setupDelete({ count: 1 });
    const { disbandTeam } = await import("./actions");
    expect(await disbandTeam("t1", "rakete")).toEqual({ ok: true });
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("refuses a team that already stands in the bracket", async () => {
    // Die Datenbank haelt hier nichts auf: matches.participant_a_id steht auf
    // ON DELETE SET NULL. Ohne diese Pruefung liefe das Loeschen durch und
    // leerte den Slot — deshalb darf gar kein delete abgesetzt werden.
    const del = setupDelete({ inBracket: true });
    const { disbandTeam } = await import("./actions");
    expect(await disbandTeam("t1", "rakete")).toEqual({
      error:
        "Dieses Team steht bereits im Spielplan und kann nicht aufgelöst " +
        "werden. Erst das Bracket neu erzeugen.",
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("reports a team that is already gone", async () => {
    setupDelete({ count: 0 });
    const { disbandTeam } = await import("./actions");
    expect(await disbandTeam("t1", "rakete")).toEqual({
      error: "Team wurde nicht gefunden.",
    });
  });
});

describe("setCaptain", () => {
  it("refuses a player that is not yet saved into this team", async () => {
    setupStaff((table: string) =>
      table === "participants"
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
                }),
              }),
            }),
          }
        : {},
    );
    const { setCaptain } = await import("./actions");
    expect(await setCaptain("t1", "rakete", "ada")).toEqual({
      error:
        "Dieser Spieler gehört nicht zu diesem Team. Bitte erst die Zuordnung speichern.",
    });
  });

  it("clears the old captain before setting the new one", async () => {
    const update = vi
      .fn()
      // 1. Aufruf: alle im Team zuruecksetzen (.eq().eq())
      .mockReturnValueOnce({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) })
      // 2. Aufruf: einen setzen (.eq().eq() mit count)
      .mockReturnValueOnce({
        eq: () => ({ eq: () => Promise.resolve({ error: null, count: 1 }) }),
      });
    setupStaff((table: string) =>
      table === "participants"
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: { id: "ada" } }),
                  }),
                }),
              }),
            }),
            update,
          }
        : {},
    );
    const { setCaptain } = await import("./actions");

    expect(await setCaptain("t1", "rakete", "ada")).toEqual({ ok: true });
    expect(update).toHaveBeenNthCalledWith(1, { is_captain: false });
    expect(update).toHaveBeenNthCalledWith(2, { is_captain: true }, { count: "exact" });
  });
});

describe("setTeamReady", () => {
  beforeEach(() => {
    manualCheckIn.mockClear();
    resetCheckIn.mockClear();
    setupStaff(() => ({}));
  });

  it("uses the existing manual check-in on the team row", async () => {
    const { setTeamReady } = await import("./actions");
    expect(await setTeamReady("t1", "rakete", true)).toEqual({ ok: true });
    expect(manualCheckIn).toHaveBeenCalledWith("rakete", "t1");
    expect(resetCheckIn).not.toHaveBeenCalled();
  });

  it("takes the readiness back via resetCheckIn", async () => {
    const { setTeamReady } = await import("./actions");
    expect(await setTeamReady("t1", "rakete", false)).toEqual({ ok: true });
    expect(resetCheckIn).toHaveBeenCalledWith("rakete", "t1");
    expect(manualCheckIn).not.toHaveBeenCalled();
  });
});
