/**
 * The card is what the person on the door reads instead of the screen they are
 * not looking at, so the tone (which colour shouts) and the headline (who or
 * what went wrong) are pinned per outcome.
 */
import { describe, it, expect } from "vitest";

import { resultContent } from "./scan-result-card";

describe("resultContent", () => {
  it("greets a fresh check-in by name in lime", () => {
    const { tone, headline } = resultContent({
      kind: "success",
      name: "Lena Fuchs",
    });
    expect(tone).toBe("lime");
    expect(headline).toBe("Lena Fuchs");
  });

  it("warns by name when someone is already inside", () => {
    const { tone, headline } = resultContent({
      kind: "already",
      name: "Lena Fuchs",
      since: "2026-08-07T18:33:12Z",
    });
    expect(tone).toBe("warn");
    expect(headline).toBe("Lena Fuchs");
  });

  it("says when the badge belongs to nobody", () => {
    const { tone, headline } = resultContent({ kind: "unknown" });
    expect(tone).toBe("live");
    expect(headline).toBe("QR nicht erkannt");
  });

  it("names the missing consent rather than blaming the scan", () => {
    const { tone, headline } = resultContent({ kind: "consent" });
    expect(tone).toBe("live");
    expect(headline).toBe("Einwilligung fehlt");
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
    });
    expect(detail).toContain("07.08.");
    expect(detail).toContain("20:33");
    expect(detail).toContain("Schon anwesend");
  });
});
