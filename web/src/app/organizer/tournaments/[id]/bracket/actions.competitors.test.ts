/**
 * Der wichtigste Test des Team-Umbaus: in die Bracket-Erzeugung gehen
 * WETTKAEMPFER, nicht Menschen.
 *
 * Bei 4 Teams à 3 Spielern stehen 16 Zeilen in participants. Ohne den
 * type-Filter zieht generateBracket alle 16 in den Spielplan — Kinder spielen
 * gegen ihre eigenen Teams, und ihre Klarnamen stehen auf dem oeffentlichen
 * Board. Die bestehende guard-Testdatei kommt nie bis dorthin (sie laesst
 * from("tournaments") auf data:null laufen und endet VOR dem participants-Read),
 * deshalb baut dieser Mock die Abfrage so weit nach, dass der Read wirklich
 * passiert — inklusive Filter: der Mock filtert selbst nach type, ein
 * vergessenes .in() liefert also alle 16 Zeilen zurueck.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { id: string; seed: number | null; created_at: string; type: string };

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

let mockClient: MockClient;
let insertedRows: { participant_a_id: string | null; participant_b_id: string | null }[];
let participantSelect: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockClient),
}));

/** 4 Team-Zeilen + 12 Spieler-Zeilen, alle eingecheckt. */
function tournamentRows(): Row[] {
  const rows: Row[] = [];
  for (let t = 0; t < 4; t++) {
    rows.push({ id: `team${t}`, seed: t + 1, created_at: `2026-01-0${t + 1}`, type: "team" });
    for (let p = 0; p < 3; p++) {
      rows.push({
        id: `player${t}-${p}`,
        seed: null,
        created_at: `2026-02-0${p + 1}`,
        type: "player",
      });
    }
  }
  return rows;
}

/**
 * Ein Mini-PostgREST: die Kette sammelt Filter ein, `then` liefert die Zeilen,
 * die uebrig bleiben. Nur `in("type", …)` wird ausgewertet — genau der Filter,
 * um den es geht.
 */
function participantsQuery(rows: Row[]) {
  let result = rows;
  const chain = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    order: () => chain,
    in: (column: string, values: string[]) => {
      if (column === "type") result = result.filter((r) => values.includes(r.type));
      return chain;
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: result, error: null }),
  };
  return chain;
}

function setup(rows: Row[]) {
  insertedRows = [];
  participantSelect = vi.fn(() => participantsQuery(rows));

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
      if (table === "participants") {
        return {
          select: participantSelect,
          // Seed-Korrektur: eq().eq() und fertig.
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      if (table === "matches") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: (rows_: typeof insertedRows) => {
            insertedRows = rows_;
            return {
              select: () =>
                Promise.resolve({
                  data: rows_.map((_, i) => ({
                    id: `m${i}`,
                    bracket: "winner",
                    round: 1,
                    slot: i,
                  })),
                  error: null,
                }),
            };
          },
        };
      }
      if (table === "tournaments") {
        return {
          // Round Robin: keine Advancement-Links, der Test bleibt beim Thema.
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "t1", format: "round_robin" },
                  error: null,
                }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return {};
    }),
  };
}

/** Alle Teilnehmer-Ids, die in den erzeugten Matches vorkommen. */
function participantsInBracket(): string[] {
  const ids = new Set<string>();
  for (const m of insertedRows) {
    if (m.participant_a_id) ids.add(m.participant_a_id);
    if (m.participant_b_id) ids.add(m.participant_b_id);
  }
  return [...ids].sort();
}

describe("generateBracket zieht Wettkaempfer, keine Menschen", () => {
  beforeEach(() => {
    setup(tournamentRows());
  });

  it("setzt bei 4 Teams à 3 Spielern genau 4 Teilnehmer ins Bracket", async () => {
    const { generateBracket } = await import("./actions");
    const result = await generateBracket("t1", { discardResults: true });

    expect(result).toEqual({ ok: true });
    expect(participantsInBracket()).toEqual([
      "team0",
      "team1",
      "team2",
      "team3",
    ]);
    // Round Robin mit 4 Teilnehmern: 6 Paarungen. Mit 16 waeren es 120.
    expect(insertedRows).toHaveLength(6);
  });

  it("fragt participants ueberhaupt nach dem Typ", async () => {
    const { generateBracket } = await import("./actions");
    await generateBracket("t1", { discardResults: true });

    // Ohne diesen Read waere der Test oben nur zufaellig gruen.
    expect(participantSelect).toHaveBeenCalled();
    expect(participantsInBracket()).not.toContain("player0-0");
  });

  it("weist einen Spieler im Seeding ab", async () => {
    const { saveSeeds } = await import("./actions");
    const result = await saveSeeds("t1", ["team0", "player0-1"]);

    expect(result).toEqual({
      error: "Ungültiger oder nicht eingecheckter Teilnehmer im Seeding.",
    });
  });

  it("nimmt reine Wettkaempfer im Seeding an", async () => {
    const { saveSeeds } = await import("./actions");
    const result = await saveSeeds("t1", ["team3", "team0", "team1", "team2"]);

    expect(result).toEqual({ ok: true });
  });
});
