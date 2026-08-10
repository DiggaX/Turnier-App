import { describe, it, expect } from "vitest";
import { lostWork } from "@/lib/bracket/regenerate-warning";

describe("lostWork", () => {
  it("is null when a regenerate costs nothing", () => {
    expect(lostWork(0, 0)).toBeNull();
  });

  it("declines released results", () => {
    expect(lostWork(1, 0)).toEqual({
      label: "1 gespieltes Ergebnis",
      plural: false,
    });
    expect(lostWork(3, 0)).toEqual({
      label: "3 gespielte Ergebnisse",
      plural: true,
    });
  });

  it("declines matches in progress", () => {
    expect(lostWork(0, 1)).toEqual({
      label: "1 laufendes Spiel",
      plural: false,
    });
    expect(lostWork(0, 2)).toEqual({
      label: "2 laufende Spiele",
      plural: true,
    });
  });

  it("declines reports on matches nobody released yet", () => {
    expect(lostWork(0, 0, 1)).toEqual({
      label: "1 gemeldetes Ergebnis ohne Freigabe",
      plural: false,
    });
    expect(lostWork(0, 0, 2)).toEqual({
      label: "2 gemeldete Ergebnisse ohne Freigabe",
      plural: true,
    });
  });

  it("names both kinds when both exist", () => {
    expect(lostWork(3, 2)).toEqual({
      label: "3 gespielte Ergebnisse und 2 laufende Spiele",
      plural: true,
    });
  });

  it("comma-separates three kinds, 'und' before the last", () => {
    expect(lostWork(3, 1, 2)).toEqual({
      label:
        "3 gespielte Ergebnisse, 1 laufendes Spiel und " +
        "2 gemeldete Ergebnisse ohne Freigabe",
      plural: true,
    });
  });

  it("takes a plural verb once the singulars add up", () => {
    expect(lostWork(1, 1)).toEqual({
      label: "1 gespieltes Ergebnis und 1 laufendes Spiel",
      plural: true,
    });
  });
});
