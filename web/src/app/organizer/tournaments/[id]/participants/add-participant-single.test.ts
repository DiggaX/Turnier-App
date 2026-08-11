/**
 * Der zweite Weg der Nachmeldung: EIN Spieler bei einem Teamturnier.
 *
 * Live wurde aus einem Kind ohne Handy ein 1-von-3-Geisterteam, weil der Tresen
 * nichts anderes anbieten konnte. Diese Tests pinnen, was stattdessen passiert:
 * eine Personen-Zeile (type='player') ohne Team, wahlweise direkt in ein
 * bestehendes Team — und dort nur dann als Captain, wenn das Team leer war.
 *
 * Eigene Datei neben actions.test.ts: dort steckt der Team- und der Solo-Weg
 * mit einem absichtlich dummen Mock, hier braucht es einen, der auch die
 * Ketten von moveInto und syncTeamReady bedient.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

let requireStaffResult:
  | { supabase: MockSupabase; orgId: string | null }
  | { error: string };

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: () => Promise.resolve(requireStaffResult),
  requireOrganizerOrAdmin: () => Promise.resolve(requireStaffResult),
}));

type Read = { data: unknown; error: unknown };
type Write = { error: unknown; count: number };

// Die Kettenglieder sind explizit typisiert: ein Objektliteral, das sich selbst
// zurueckgibt, waere sonst implizit any und faellt unter strict durch.
interface ReadChain {
  eq: () => ReadChain;
  in: () => ReadChain;
  is: () => ReadChain;
  maybeSingle: () => Promise<Read>;
  then: (resolve: (value: Read) => unknown) => unknown;
}

interface WriteChain {
  eq: () => WriteChain;
  in: () => WriteChain;
  is: () => WriteChain;
  then: (resolve: (value: Write) => unknown) => unknown;
}

type Mate = { id: string; checked_in_at: string | null };

/**
 * Kleines PostgREST-Double. Es unterscheidet nur so viel, wie addParticipant
 * unterscheidet: `maybeSingle()` ist die Team-Pruefung, ein direkt erwartetes
 * `select()` die Mitgliederliste, jedes `update()` wird mitgeschrieben.
 *
 * `mates` ist eine Warteschlange, weil zwei verschiedene Fragen dieselbe
 * Abfrage benutzen: der erste Blick entscheidet ueber den Captain (war das Team
 * leer?), der zweite ueber die Spielbereitschaft — und der faellt nach Umzug
 * und Check-in anders aus. Der letzte Eintrag gilt fuer alle weiteren Blicke.
 */
function setup(options?: {
  teamSize?: number;
  team?: { id: string } | null;
  mates?: Mate[][];
  /** Laesst den team_id-UPDATE scheitern — der Weg des Schiedsrichters. */
  moveFails?: boolean;
  /** Laesst nur den Nachzug der Spielbereitschaft scheitern. */
  readyFails?: boolean;
}) {
  const inserts: unknown[] = [];
  const updates: Record<string, unknown>[] = [];
  const team = options?.team === undefined ? { id: "team-1" } : options.team;
  const mates = options?.mates ?? [[]];
  let read = 0;

  const readChain = (): ReadChain => {
    const chain: ReadChain = {
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      maybeSingle: () => Promise.resolve({ data: team, error: null }),
      then: (resolve) =>
        resolve({
          data: mates[Math.min(read++, mates.length - 1)],
          error: null,
        }),
    };
    return chain;
  };

  const writeChain = (payload: Record<string, unknown>): WriteChain => {
    updates.push(payload);
    // guard_participant_protected_fields wirft dem Schiedsrichter genau hier
    // 42501 entgegen: team_id aendern darf er nicht, nachmelden schon.
    const error =
      (options?.moveFails && "team_id" in payload) ||
      (options?.readyFails && "checked_in_at" in payload)
        ? { code: "42501", message: "insufficient_privilege" }
        : null;
    const chain: WriteChain = {
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      then: (resolve) => resolve({ error, count: error ? 0 : 1 }),
    };
    return chain;
  };

  const rpc = vi.fn().mockResolvedValue({ error: null });
  const supabase: MockSupabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "t1", team_size: options?.teamSize ?? 3 },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table !== "participants") return {};
      return {
        select: readChain,
        update: writeChain,
        insert: (payload: unknown) => {
          inserts.push(payload);
          // Die Aufstellung geht als Array raus, die Hauptzeile einzeln mit
          // .select().single() dahinter — unterschieden wird an der Nutzlast.
          if (Array.isArray(payload)) return Promise.resolve({ error: null });
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "p-new" }, error: null }),
            }),
          };
        },
      };
    }),
    rpc,
  };
  requireStaffResult = { supabase, orgId: "org-1" };
  return { inserts, updates, rpc };
}

describe("addParticipant — Einzelspieler bei Teamturnier", () => {
  it("legt eine Personen-Zeile ohne Team an und checkt sie ein", async () => {
    const { inserts, updates, rpc } = setup({ teamSize: 3 });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", " Niki ", "2014-05-02", " nik ", [], {
      asSingle: true,
    });

    expect(result).toEqual({ ok: true });
    // type='player' statt 'team': wer allein kommt, ist ein Mensch und kein
    // Wettkaempfer — sonst stuende er als 1-von-3-Team im Spielplan.
    expect(inserts).toEqual([
      {
        tournament_id: "t1",
        user_id: null,
        type: "player",
        display_name: "Niki",
        gamertag: "nik",
        birthdate: "2014-05-02",
      },
    ]);
    expect(updates).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("check_in", {
      p_participant_id: "p-new",
      p_method: "manual",
    });
  });

  it("macht den Ersten in einem leeren Team zum Captain", async () => {
    const { updates } = setup({ teamSize: 3, mates: [[]] });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Niki", "2014-05-02", null, [], {
      asSingle: true,
      teamId: "team-1",
    });

    expect(result).toEqual({ ok: true });
    expect(updates).toEqual([{ team_id: "team-1" }, { is_captain: true }]);
  });

  it("setzt keinen zweiten Captain in ein besetztes Team", async () => {
    const { updates } = setup({
      teamSize: 3,
      mates: [[{ id: "m1", checked_in_at: null }]],
    });
    const { addParticipant } = await import("./actions");
    await addParticipant("t1", "Niki", "2014-05-02", null, [], {
      asSingle: true,
      teamId: "team-1",
    });

    expect(updates).toEqual([{ team_id: "team-1" }]);
  });

  it("meldet das Team spielbereit, sobald der Neue es vollzaehlig macht", async () => {
    const { updates } = setup({
      teamSize: 2,
      mates: [
        [{ id: "m1", checked_in_at: "2026-08-11T10:00:00Z" }],
        [
          { id: "m1", checked_in_at: "2026-08-11T10:00:00Z" },
          { id: "p-new", checked_in_at: "2026-08-11T10:05:00Z" },
        ],
      ],
    });
    const { addParticipant } = await import("./actions");
    await addParticipant("t1", "Niki", "2014-05-02", null, [], {
      asSingle: true,
      teamId: "team-1",
    });

    // Der Nachzug haengt am Check-in davor: ohne ihn bliebe das gerade
    // vollzaehlig gewordene Team mit checked_in_at NULL stehen und
    // generateBracket wuerde es wortlos uebergehen.
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({ team_id: "team-1" });
    expect(updates[1]).toHaveProperty("checked_in_at");
  });

  it("sagt nach fehlgeschlagenem Umzug, dass die Person schon steht", async () => {
    const { rpc, updates } = setup({ teamSize: 3, moveFails: true });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Niki", "2014-05-02", null, [], {
      asSingle: true,
      teamId: "team-1",
    });

    // Eingecheckt wird VOR dem Umzug: sonst bliebe hier eine angelegte, nicht
    // eingecheckte Zeile stehen, waehrend die Meldung nur von einem
    // Zuordnungsfehler spraeche — der naechste Versuch am Tresen erzeugt dann
    // die Dublette, gegen die dieser Weg gebaut wurde.
    expect(rpc).toHaveBeenCalledWith("check_in", {
      p_participant_id: "p-new",
      p_method: "manual",
    });
    expect(result).toEqual({
      error:
        "Niki wurde angelegt und eingecheckt, aber die Team-Zuordnung ist " +
        "fehlgeschlagen. Bitte im Restspieler-Panel zuordnen.",
    });
    // Nach dem Fehlschlag kein Captain-Update mehr.
    expect(updates).toEqual([{ team_id: "team-1" }]);
  });

  it("sagt nach fehlgeschlagenem Nachzug, dass die Person schon im Team steht", async () => {
    const { updates } = setup({
      teamSize: 2,
      readyFails: true,
      mates: [
        [{ id: "m1", checked_in_at: "2026-08-11T10:00:00Z" }],
        [
          { id: "m1", checked_in_at: "2026-08-11T10:00:00Z" },
          { id: "p-new", checked_in_at: "2026-08-11T10:05:00Z" },
        ],
      ],
    });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Niki", "2014-05-02", null, [], {
      asSingle: true,
      teamId: "team-1",
    });

    // Der rohe Datenbankfehler verschwieg, dass Anlegen, Check-in und
    // Zuordnung durch sind — der Tresen tippt die Person dann ein zweites Mal
    // ein. Fehlen tut nur die Spielbereitschaft, und die ist von Hand zu holen.
    expect(result).toEqual({
      error:
        "Niki wurde angelegt, eingecheckt und dem Team zugeordnet, aber die " +
        "Spielbereitschaft ließ sich nicht nachziehen. Bitte das Team ggf. " +
        "auf der Teams-Seite spielbereit melden.",
    });
    expect(updates).toEqual([
      { team_id: "team-1" },
      { checked_in_at: expect.any(String) },
    ]);
  });

  it("lehnt ein volles Team ab, bevor jemand angelegt wird", async () => {
    const { inserts, updates } = setup({
      teamSize: 2,
      mates: [
        [
          { id: "m1", checked_in_at: null },
          { id: "m2", checked_in_at: null },
        ],
      ],
    });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Niki", "2014-05-02", null, [], {
      asSingle: true,
      teamId: "team-1",
    });

    expect(result).toEqual({
      error:
        "Dieses Team ist bereits vollzählig — bitte ein anderes Team wählen " +
        "oder ohne Team anlegen.",
    });
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("lehnt ein unbekanntes Team ab, bevor irgendetwas angelegt wird", async () => {
    const { inserts, updates } = setup({ teamSize: 3, team: null });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Niki", "2014-05-02", null, [], {
      asSingle: true,
      teamId: "fremdes-team",
    });

    expect(result).toEqual({ error: "Unbekanntes Team in der Zuordnung." });
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("laesst den Teamweg unveraendert", async () => {
    const { inserts, updates } = setup({ teamSize: 3 });
    const { addParticipant } = await import("./actions");
    const result = await addParticipant("t1", "Team Rakete", "2013-04-10", null, [
      { name: "Ada" },
      { name: "Bo" },
    ]);

    expect(result).toEqual({ ok: true });
    expect(inserts[0]).toMatchObject({ type: "team", display_name: "Team Rakete" });
    expect(inserts[1]).toMatchObject([
      { type: "player", team_id: "p-new", display_name: "Ada", is_captain: true },
      { type: "player", team_id: "p-new", display_name: "Bo", is_captain: false },
    ]);
    expect(updates).toEqual([]);
  });

  it("ignoriert asSingle bei einem Einzelturnier", async () => {
    const { inserts } = setup({ teamSize: 1 });
    const { addParticipant } = await import("./actions");
    // team_size 1: jede Nachmeldung ist ohnehin eine Person, und 'solo' ist der
    // Typ, den der Guard-Trigger dort ableitet.
    await addParticipant("t1", "Luuk", "2013-04-10", null, [], {
      asSingle: true,
      teamId: "team-1",
    });

    expect(inserts[0]).toMatchObject({ type: "solo" });
  });
});
