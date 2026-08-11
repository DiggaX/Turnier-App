import { describe, it, expect } from "vitest";

import {
  NO_TEAM,
  incompleteTeams,
  newTeamIndex,
  newTeamKey,
  suggestAssignments,
  type FreeAgent,
  type TeamSlot,
} from "./free-agents";

function agents(...names: string[]): FreeAgent[] {
  return names.map((n) => ({ id: n, name: n.toUpperCase() }));
}

function team(id: string, memberCount: number): TeamSlot {
  return { id, name: id, memberCount };
}

describe("Restspieler-Zaehlung", () => {
  it("zaehlt nur Teams unter Sollstaerke", () => {
    const teams = [team("a", 3), team("b", 2), team("c", 1)];
    expect(incompleteTeams(teams, 3).map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("zaehlt bei vollstaendigen Teams nichts", () => {
    expect(incompleteTeams([team("a", 2), team("b", 2)], 2)).toEqual([]);
  });
});

describe("suggestAssignments", () => {
  it("fuellt zuerst das Team, dem am wenigsten fehlt", () => {
    const teams = [team("fast-voll", 2), team("halb", 1)];
    const plan = suggestAssignments(teams, agents("p1", "p2"), 3);

    // p1 schliesst die kleinere Luecke, p2 geht ins zweite Team.
    expect(plan).toEqual({ p1: "fast-voll", p2: "halb" });
  });

  it("bildet aus dem Rest volle Teams", () => {
    const plan = suggestAssignments([], agents("p1", "p2", "p3", "p4"), 2);

    expect(plan).toEqual({
      p1: newTeamKey(0),
      p2: newTeamKey(0),
      p3: newTeamKey(1),
      p4: newTeamKey(1),
    });
  });

  it("laesst ein angebrochenes Team lieber ungebunden", () => {
    const plan = suggestAssignments([], agents("p1", "p2", "p3"), 2);

    expect(plan.p1).toBe(newTeamKey(0));
    expect(plan.p2).toBe(newTeamKey(0));
    expect(plan.p3).toBe(NO_TEAM);
  });

  it("fuellt erst Luecken, dann neue Teams", () => {
    const teams = [team("alt", 1)];
    const plan = suggestAssignments(teams, agents("p1", "p2", "p3"), 2);

    expect(plan).toEqual({ p1: "alt", p2: newTeamKey(0), p3: newTeamKey(0) });
  });

  it("ordnet niemanden zu, wenn keine Restspieler da sind", () => {
    expect(suggestAssignments([team("a", 1)], [], 3)).toEqual({});
  });

  it("haelt sich bei Einzelturnieren raus", () => {
    const plan = suggestAssignments([], agents("p1", "p2"), 1);
    expect(plan).toEqual({ p1: NO_TEAM, p2: NO_TEAM });
  });

  it("liefert denselben Vorschlag bei gleicher Ausgangslage", () => {
    const teams = [team("b", 1), team("a", 1)];
    const first = suggestAssignments(teams, agents("p1"), 2);
    const second = suggestAssignments([...teams].reverse(), agents("p1"), 2);
    expect(first).toEqual(second);
  });
});

describe("Zielschluessel", () => {
  it("erkennt neue Teams und ignoriert Team-Ids", () => {
    expect(newTeamIndex(newTeamKey(2))).toBe(2);
    expect(newTeamIndex("6f1c9f2e-0000-4000-8000-000000000000")).toBeNull();
    expect(newTeamIndex(NO_TEAM)).toBeNull();
  });
});
