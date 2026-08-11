/**
 * Der Beitritts-Code kommt hier aus der URL, also von aussen. Die Pruefung ist
 * die Grenze: was durchkommt, landet ungefragt im Eingabefeld eines Kindes, das
 * es nicht nachliest.
 */
import { describe, it, expect } from "vitest";

import { normalizeJoinCode, teamJoinUrl } from "./join-code";

describe("normalizeJoinCode", () => {
  it("nimmt einen gültigen Code an", () => {
    expect(normalizeJoinCode("K7X2QD")).toBe("K7X2QD");
  });

  it("macht Großbuchstaben daraus", () => {
    // join_team vergleicht schreibungsblind; angezeigt wird trotzdem gross.
    expect(normalizeJoinCode("k7x2qd")).toBe("K7X2QD");
  });

  it("putzt Leerzeichen aussen weg", () => {
    expect(normalizeJoinCode("  k7x2qd ")).toBe("K7X2QD");
  });

  it("lehnt Codes mit falscher Länge ab", () => {
    expect(normalizeJoinCode("K7X2Q")).toBeNull();
    expect(normalizeJoinCode("K7X2QDE")).toBeNull();
  });

  it("lehnt die verwechselbaren Zeichen ab, die es gar nicht gibt", () => {
    // I, O, 0 und 1 vergibt create_team nie — wer sie schickt, hat geraten
    // oder abgetippt.
    expect(normalizeJoinCode("K7X2QO")).toBeNull();
    expect(normalizeJoinCode("K7X2Q0")).toBeNull();
    expect(normalizeJoinCode("K7X2QI")).toBeNull();
    expect(normalizeJoinCode("K7X2Q1")).toBeNull();
  });

  it("lehnt Lücken innerhalb des Codes ab", () => {
    expect(normalizeJoinCode("K7X 2QD")).toBeNull();
  });

  it("lehnt Fehlendes und Mehrfaches ab", () => {
    expect(normalizeJoinCode(undefined)).toBeNull();
    expect(normalizeJoinCode("")).toBeNull();
    // ?join=a&join=b — Next liefert dann ein Array.
    expect(normalizeJoinCode(["K7X2QD", "AAAAAA"])).toBeNull();
  });
});

describe("teamJoinUrl", () => {
  it("baut einen absoluten Link auf die Anmeldung mit Code", () => {
    expect(teamJoinUrl("t-1", "K7X2QD")).toBe(
      `${window.location.origin}/t/t-1/register?join=K7X2QD`,
    );
    // Absolut, sonst zeigt der QR ins Nichts.
    expect(teamJoinUrl("t-1", "K7X2QD")).toMatch(/^https?:\/\//);
  });
});
