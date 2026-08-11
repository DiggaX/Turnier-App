/**
 * Restspieler zuordnen — und was danach mit der Spielbereitschaft passiert.
 *
 * Der Trigger sync_team_ready feuert nur, wenn sich die ANWESENHEIT einer
 * Person aendert. Beim Umhaengen aendert sich nur ihr Team, der Trigger bleibt
 * also stumm. Ohne den Nachzug in der Aktion steht ein frisch vervollstaendigtes
 * Team mit checked_in_at NULL da und faellt aus dem Bracket, ohne dass irgendwo
 * steht warum.
 *
 * Der Mock ist deshalb eine kleine Tabelle statt fester Rueckgaben: die UPDATEs
 * schreiben wirklich hinein, und geprueft wird der Zustand der Team-Zeile am
 * Ende — ein Test, der nur zaehlt, wie oft update() gerufen wurde, waere auch
 * gruen, wenn der Filter danebengreift.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = {
  id: string;
  tournament_id: string;
  type: string;
  team_id: string | null;
  checked_in_at: string | null;
  is_captain?: boolean;
  display_name?: string;
};

type Filter = { op: "eq" | "in" | "is"; col: string; value: unknown };

type SelectChain = {
  select: (cols?: string) => SelectChain;
  eq: (col: string, value: unknown) => SelectChain;
  in: (col: string, values: unknown[]) => SelectChain;
  is: (col: string, value: unknown) => SelectChain;
  then: (resolve: (v: { data: Row[]; error: null }) => unknown) => unknown;
};

type WriteChain = {
  eq: (col: string, value: unknown) => WriteChain;
  in: (col: string, values: unknown[]) => WriteChain;
  is: (col: string, value: unknown) => WriteChain;
  then: (resolve: (v: { error: null }) => unknown) => unknown;
};

let db: Row[];
let mockSupabase: { from: ReturnType<typeof vi.fn> };
let requireStaffResult:
  | { supabase: typeof mockSupabase; orgId: string | null }
  | { error: string };

vi.mock("@/lib/auth/staff", () => ({
  requireStaff: () => Promise.resolve(requireStaffResult),
}));

function matches(row: Row, filters: Filter[]): boolean {
  const record = row as unknown as Record<string, unknown>;
  return filters.every((f) => {
    const value = record[f.col];
    if (f.op === "in") return (f.value as unknown[]).includes(value);
    return value === f.value;
  });
}

function selectChain(): SelectChain {
  const filters: Filter[] = [];
  const chain: SelectChain = {
    select: () => chain,
    eq: (col, value) => (filters.push({ op: "eq", col, value }), chain),
    in: (col, values) => (filters.push({ op: "in", col, value: values }), chain),
    is: (col, value) => (filters.push({ op: "is", col, value }), chain),
    then: (resolve) =>
      resolve({ data: db.filter((r) => matches(r, filters)), error: null }),
  };
  return chain;
}

/** Schreibt wirklich in die Tabelle — sonst prueft der Test seinen Mock. */
function updateChain(patch: Partial<Row>): WriteChain {
  const filters: Filter[] = [];
  const chain: WriteChain = {
    eq: (col, value) => (filters.push({ op: "eq", col, value }), chain),
    in: (col, values) => (filters.push({ op: "in", col, value: values }), chain),
    is: (col, value) => (filters.push({ op: "is", col, value }), chain),
    then: (resolve) => {
      for (const row of db) if (matches(row, filters)) Object.assign(row, patch);
      return resolve({ error: null });
    },
  };
  return chain;
}

function setup(rows: Row[], teamSize: number) {
  db = rows;
  mockSupabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { team_size: teamSize }, error: null }),
            }),
          }),
        };
      }
      if (table === "participants") {
        return {
          select: () => selectChain(),
          update: (patch: Partial<Row>) => updateChain(patch),
        };
      }
      return {};
    }),
  };
  requireStaffResult = { supabase: mockSupabase, orgId: "org-1" };
}

function team(id: string): Row {
  return {
    id,
    tournament_id: "t1",
    type: "team",
    team_id: null,
    checked_in_at: null,
    display_name: id,
  };
}

function player(id: string, present: boolean): Row {
  return {
    id,
    tournament_id: "t1",
    type: "player",
    team_id: null,
    checked_in_at: present ? "2026-08-11T09:00:00Z" : null,
    display_name: id,
  };
}

describe("assignFreeAgents", () => {
  beforeEach(() => {
    setup(
      [team("team1"), player("p1", true), player("p2", true), player("p3", true)],
      3,
    );
  });

  it("haengt die Spieler in das Team", async () => {
    const { assignFreeAgents } = await import("./free-agent-actions");
    const result = await assignFreeAgents(
      "t1",
      [{ teamId: "team1", playerIds: ["p1", "p2", "p3"] }],
      [],
    );

    expect(result).toEqual({ ok: true });
    expect(db.filter((r) => r.team_id === "team1").map((r) => r.id)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("meldet das vollzaehlige Team spielbereit", async () => {
    const { assignFreeAgents } = await import("./free-agent-actions");
    await assignFreeAgents(
      "t1",
      [{ teamId: "team1", playerIds: ["p1", "p2", "p3"] }],
      [],
    );

    expect(db.find((r) => r.id === "team1")?.checked_in_at).not.toBeNull();
  });

  it("laesst ein Team ohne genug Anwesende ungemeldet", async () => {
    setup([team("team1"), player("p1", true), player("p2", false)], 3);
    const { assignFreeAgents } = await import("./free-agent-actions");
    const result = await assignFreeAgents(
      "t1",
      [{ teamId: "team1", playerIds: ["p1", "p2"] }],
      [],
    );

    expect(result).toEqual({ ok: true });
    expect(db.find((r) => r.id === "team1")?.checked_in_at).toBeNull();
  });

  it("weist eine Id ab, die nicht zu diesem Turnier gehoert", async () => {
    const { assignFreeAgents } = await import("./free-agent-actions");
    const result = await assignFreeAgents(
      "t1",
      [{ teamId: "team1", playerIds: ["p1", "fremd"] }],
      [],
    );

    expect(result).toEqual({ error: "Unbekannter Spieler in der Zuordnung." });
    expect(db.find((r) => r.id === "p1")?.team_id).toBeNull();
  });
});
