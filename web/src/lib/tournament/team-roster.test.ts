import { describe, it, expect } from "vitest";
import { teamRosterLines } from "@/lib/tournament/team-roster";

describe("teamRosterLines", () => {
  it("is empty without rows", () => {
    expect(teamRosterLines([]).size).toBe(0);
  });

  it("joins one team with the captain first, marked (C)", () => {
    const lines = teamRosterLines([
      { team_id: "t1", display_name: "Anna", is_captain: false },
      { team_id: "t1", display_name: "Niki", is_captain: true },
      { team_id: "t1", display_name: "Tom", is_captain: false },
    ]);
    expect(lines.get("t1")).toBe("Niki (C) · Anna · Tom");
  });

  it("keeps the teams apart", () => {
    const lines = teamRosterLines([
      { team_id: "t1", display_name: "Anna", is_captain: true },
      { team_id: "t2", display_name: "Max", is_captain: false },
      { team_id: "t1", display_name: "Tom", is_captain: false },
    ]);
    expect(lines.get("t1")).toBe("Anna (C) · Tom");
    expect(lines.get("t2")).toBe("Max");
  });

  it("drops players without a team — they are in no roster", () => {
    const lines = teamRosterLines([
      { team_id: null, display_name: "Lea", is_captain: false },
      { team_id: "t1", display_name: "Max", is_captain: false },
    ]);
    expect(lines.size).toBe(1);
    expect(lines.get("t1")).toBe("Max");
  });

  it("takes is_captain null as 'not the captain'", () => {
    const lines = teamRosterLines([
      { team_id: "t1", display_name: "Anna", is_captain: null },
      { team_id: "t1", display_name: "Niki", is_captain: true },
    ]);
    expect(lines.get("t1")).toBe("Niki (C) · Anna");
  });
});
