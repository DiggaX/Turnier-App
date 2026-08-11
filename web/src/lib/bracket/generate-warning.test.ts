import { describe, it, expect } from "vitest";
import { generateWarning } from "@/lib/bracket/generate-warning";

describe("generateWarning", () => {
  it("is null when everybody checked in gets a match", () => {
    expect(
      generateWarning({ orphanNames: [], notReadyTeamNames: [] }),
    ).toBeNull();
  });

  it("names the one player without a team", () => {
    expect(
      generateWarning({ orphanNames: ["Anna"], notReadyTeamNames: [] }),
    ).toEqual([
      "Dieser eingecheckte Spieler steht in keiner Mannschaft und bekommt " +
        "KEIN Match: Anna",
    ]);
  });

  it("counts and lists several players without a team", () => {
    expect(
      generateWarning({
        orphanNames: ["Anna", "Ben", "Clara"],
        notReadyTeamNames: [],
      }),
    ).toEqual([
      "Diese 3 eingecheckten Spieler stehen in keiner Mannschaft und bekommen " +
        "KEIN Match: Anna, Ben, Clara",
    ]);
  });

  it("names the one team that is not ready", () => {
    expect(
      generateWarning({ orphanNames: [], notReadyTeamNames: ["Team Alpha"] }),
    ).toEqual(["Dieses Team ist nicht spielbereit und wird übergangen: Team Alpha"]);
  });

  it("counts and lists several teams that are not ready", () => {
    expect(
      generateWarning({
        orphanNames: [],
        notReadyTeamNames: ["Team Alpha", "Team Beta"],
      }),
    ).toEqual([
      "Diese 2 Teams sind nicht spielbereit und werden übergangen: " +
        "Team Alpha, Team Beta",
    ]);
  });

  it("says both, players first — they are the ones standing in the room", () => {
    expect(
      generateWarning({
        orphanNames: ["Anna", "Ben"],
        notReadyTeamNames: ["Team Alpha"],
      }),
    ).toEqual([
      "Diese 2 eingecheckten Spieler stehen in keiner Mannschaft und bekommen " +
        "KEIN Match: Anna, Ben",
      "Dieses Team ist nicht spielbereit und wird übergangen: Team Alpha",
    ]);
  });
});
