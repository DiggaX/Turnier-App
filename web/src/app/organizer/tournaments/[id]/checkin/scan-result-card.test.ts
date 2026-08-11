/**
 * The card is what the person on the door reads instead of the screen they are
 * not looking at, so the tone (which colour shouts) and the headline (who or
 * what went wrong) are pinned per outcome.
 */
import { describe, it, expect } from "vitest";

import { resultContent } from "./scan-result-card";

describe("resultContent", () => {
  it("greets a fresh check-in by name in lime", () => {
    const { tone, headline, detail } = resultContent({
      kind: "success",
      name: "Lena Fuchs",
      photoConsent: false,
    });
    expect(tone).toBe("lime");
    expect(headline).toBe("Lena Fuchs");
    expect(detail).toBe("Eingecheckt");
  });

  // Die Fotoerlaubnis ist das eine Extra, nach dem am Einlass gefragt wird —
  // sie bekommt eine eigene Farbe, nicht nur eine Zeile Kleingedrucktes.
  it("turns cyan and says so when a photo consent exists", () => {
    const { tone, detail } = resultContent({
      kind: "success",
      name: "Lena Fuchs",
      photoConsent: true,
    });
    expect(tone).toBe("cyan");
    expect(detail).toBe("Eingecheckt · Fotoerlaubnis erteilt");
  });

  it("warns by name when someone is already inside", () => {
    const { tone, headline } = resultContent({
      kind: "already",
      name: "Lena Fuchs",
      since: "2026-08-07T18:33:12Z",
      photoConsent: false,
    });
    expect(tone).toBe("warn");
    expect(headline).toBe("Lena Fuchs");
  });

  it("says when the badge belongs to nobody", () => {
    const { tone, headline } = resultContent({ kind: "unknown" });
    expect(tone).toBe("live");
    expect(headline).toBe("QR nicht erkannt");
  });

  it("falls back to a retry prompt on a failed check-in", () => {
    const { tone, headline } = resultContent({ kind: "error" });
    expect(tone).toBe("live");
    expect(headline).toBe("Check-in fehlgeschlagen");
  });

  /**
   * Formatted through Europe/Berlin, never the runtime zone — 18:33 UTC is
   * 20:33 at the door, and a raw toLocaleString would also break hydration.
   */
  it("says since when for someone already inside", () => {
    const { detail } = resultContent({
      kind: "already",
      name: "Lena Fuchs",
      since: "2026-08-07T18:33:12Z",
      photoConsent: false,
    });
    expect(detail).toContain("07.08.");
    expect(detail).toContain("20:33");
    expect(detail).toContain("Schon anwesend");
  });

  it("mentions the photo consent on a repeat scan too", () => {
    const { detail } = resultContent({
      kind: "already",
      name: "Lena Fuchs",
      since: "2026-08-07T18:33:12Z",
      photoConsent: true,
    });
    expect(detail).toContain("Fotoerlaubnis erteilt");
  });

  /**
   * Der Code vom letzten Turnier ist der häufigste Fehlscan, und er sah früher
   * aus wie ein Erfolg — der Scan checkte still ins alte Turnier ein. Jetzt
   * bleibt er rot und nennt Person und Turnier, damit an der Tür sofort klar
   * ist, dass hier eine Anmeldung fehlt und kein Code kaputt ist.
   */
  it("names person and tournament when the code is from another one", () => {
    const { tone, headline, detail } = resultContent({
      kind: "otherTournament",
      name: "Lena Fuchs",
      tournament: "Mission: Next Level EA Sports 2026",
    });
    expect(tone).toBe("live");
    expect(headline).toBe("Lena Fuchs");
    expect(detail).toContain("Mission: Next Level EA Sports 2026");
    expect(detail).toContain("nicht angemeldet");
  });

  /**
   * Dasselbe Ereignis, anderer Ausgang: ist die Übernahme freigeschaltet, wird
   * aus der Ablehnung eine Frage. Der Ton trägt das — Bernstein statt Rot — und
   * das Fragezeichen ist der Unterschied, der an der Tür ankommt.
   */
  it("asks instead of refusing when the carry-over is on", () => {
    const { tone, headline, detail } = resultContent({
      kind: "carryOverOffer",
      name: "Lena Fuchs",
      tournament: "Mission: Next Level EA Sports 2026",
      token: "irrelevant-für-den-text",
    });
    expect(tone).toBe("warn");
    expect(headline).toBe("Lena Fuchs");
    expect(detail).toContain("Mission: Next Level EA Sports 2026");
    expect(detail).toContain("?");
  });

  // Die Fotoerlaubnis wird nie mitkopiert. Dass sie fehlt, muss auf der Karte
  // stehen — danach fragen Fotografen, und ein blosses "Eingecheckt" verschwiege
  // es genauso wie die Tatsache, dass gerade eine Anmeldung entstanden ist.
  it("says a carried-over person has no photo consent", () => {
    const { tone, headline, detail } = resultContent({
      kind: "carriedOver",
      name: "Lena Fuchs",
    });
    expect(tone).toBe("lime");
    expect(headline).toBe("Lena Fuchs");
    expect(detail).toContain("Übernommen");
    expect(detail).toContain("keine Fotoerlaubnis");
  });

  // Die Begründung kommt aus der Datenbankfunktion und ist für den Tresen
  // geschrieben — sie muss unverändert durchkommen.
  it("passes the reason through unchanged", () => {
    const { tone, detail } = resultContent({
      kind: "carryOverFailed",
      reason: "Die Uebernahme ist fuer diese Organisation nicht freigeschaltet.",
    });
    expect(tone).toBe("live");
    expect(detail).toBe(
      "Die Uebernahme ist fuer diese Organisation nicht freigeschaltet.",
    );
  });
});
