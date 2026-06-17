import { describe, expect, it } from "vitest";
import { canEditStructure, nextStatus, teamLabel } from "./lifecycle";

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
