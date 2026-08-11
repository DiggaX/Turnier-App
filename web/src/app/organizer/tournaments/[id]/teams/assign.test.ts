/**
 * Die Zuordnungslogik des Teams-Screens, geprueft ohne Zeigegeraet.
 *
 * Ziehen selbst laesst sich in jsdom nicht sinnvoll nachstellen — deshalb liegt
 * jede Entscheidung, die ein Zug ausloest, in assign.ts und wird hier geprueft.
 */
import { describe, it, expect } from "vitest";

import {
  assignPlayer,
  fillFor,
  membersOf,
  pendingChanges,
  type Assignment,
} from "./assign";

const roster: Assignment[] = [
  { playerId: "ada", teamId: "rakete" },
  { playerId: "bo", teamId: "rakete" },
  { playerId: "cem", teamId: null },
];

describe("assignPlayer", () => {
  it("moves a player into a team", () => {
    const next = assignPlayer(roster, "cem", "rakete");
    expect(membersOf(next, "rakete")).toEqual(["ada", "bo", "cem"]);
    expect(membersOf(next, null)).toEqual([]);
  });

  it("moves a player out of every team", () => {
    const next = assignPlayer(roster, "ada", null);
    expect(membersOf(next, null)).toEqual(["ada", "cem"]);
    expect(membersOf(next, "rakete")).toEqual(["bo"]);
  });

  it("moves a player straight from one team to another", () => {
    const next = assignPlayer(roster, "ada", "komet");
    expect(membersOf(next, "rakete")).toEqual(["bo"]);
    expect(membersOf(next, "komet")).toEqual(["ada"]);
  });

  it("returns the same array when nothing changes", () => {
    expect(assignPlayer(roster, "ada", "rakete")).toBe(roster);
  });

  it("ignores an unknown player instead of inventing a row", () => {
    // Ein Drop nach einem Refresh darf keine Zeile erfinden.
    const next = assignPlayer(roster, "geist", "rakete");
    expect(next).toBe(roster);
    expect(next).toHaveLength(3);
  });

  it("leaves the other players alone", () => {
    const next = assignPlayer(roster, "cem", "rakete");
    expect(next.find((a) => a.playerId === "ada")).toEqual({
      playerId: "ada",
      teamId: "rakete",
    });
  });
});

describe("fillFor", () => {
  it("reports an empty team", () => {
    expect(fillFor(roster, "komet", 3)).toEqual({
      count: 0,
      teamSize: 3,
      state: "empty",
    });
  });

  it("reports an incomplete team", () => {
    expect(fillFor(roster, "rakete", 3)).toEqual({
      count: 2,
      teamSize: 3,
      state: "under",
    });
  });

  it("reports a complete team", () => {
    expect(fillFor(roster, "rakete", 2).state).toBe("full");
  });

  it("shows overfilling instead of preventing it", () => {
    // Die Orga hat am Tresen den Ueberblick und darf ueberbesetzen — es wird
    // angezeigt, nicht verhindert.
    const over = assignPlayer(roster, "cem", "rakete");
    expect(fillFor(over, "rakete", 2)).toEqual({
      count: 3,
      teamSize: 2,
      state: "over",
    });
  });
});

describe("pendingChanges", () => {
  it("is empty when nothing was moved", () => {
    expect(pendingChanges(roster, roster)).toEqual([]);
  });

  it("returns only the players whose team actually differs", () => {
    const moved = assignPlayer(roster, "cem", "rakete");
    expect(pendingChanges(roster, moved)).toEqual([
      { playerId: "cem", teamId: "rakete" },
    ]);
  });

  it("drops a move that was undone again", () => {
    const there = assignPlayer(roster, "cem", "rakete");
    const back = assignPlayer(there, "cem", null);
    expect(pendingChanges(roster, back)).toEqual([]);
  });

  it("counts a move out of a team", () => {
    const moved = assignPlayer(roster, "ada", null);
    expect(pendingChanges(roster, moved)).toEqual([
      { playerId: "ada", teamId: null },
    ]);
  });
});
