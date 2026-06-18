import { describe, expect, it } from "vitest";
import { canEditStructure, gameTag, nextStatus, teamLabel } from "./lifecycle";

describe("nextStatus", () => {
  it("advances draft->registration and running->finished", () => {
    expect(nextStatus("draft")).toBe("registration");
    expect(nextStatus("running")).toBe("finished");
  });
  it("has no guided next step from registration (generate starts it) or finished", () => {
    expect(nextStatus("registration")).toBeNull();
    expect(nextStatus("finished")).toBeNull();
  });
});

describe("canEditStructure", () => {
  it("allows game/format edits only while no matches exist", () => {
    expect(canEditStructure("draft", false)).toBe(true);
    expect(canEditStructure("registration", false)).toBe(true);
    expect(canEditStructure("running", true)).toBe(false);
    expect(canEditStructure("draft", true)).toBe(false);
  });
});

describe("teamLabel", () => {
  it("renders solo and NvN", () => {
    expect(teamLabel(1)).toBe("Solo");
    expect(teamLabel(2)).toBe("2v2");
    expect(teamLabel(5)).toBe("5v5");
  });
});

describe("gameTag", () => {
  it("returns first letters of first two words for a two-word name", () => {
    expect(gameTag("Counter-Strike 2")).toBe("CS");
    expect(gameTag("Rocket League")).toBe("RL");
  });

  it("slices the first two characters for a single-word name", () => {
    expect(gameTag("Valorant")).toBe("VA");
    expect(gameTag("Fortnite")).toBe("FO");
  });

  it("returns the first letter uppercased and sliced for a single letter name", () => {
    expect(gameTag("X")).toBe("X");
  });

  it("returns ?? for an empty string", () => {
    expect(gameTag("")).toBe("??");
  });

  it("handles names with special characters by stripping them", () => {
    expect(gameTag("Dota 2!")).toBe("D2");
    expect(gameTag("!!!")).toBe("??");
  });

  it("handles all-numeric names", () => {
    expect(gameTag("1234")).toBe("12");
  });
});
