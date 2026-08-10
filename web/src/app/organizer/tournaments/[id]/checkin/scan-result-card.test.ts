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
});
