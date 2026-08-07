import { describe, it, expect } from "vitest";

import { deviceLabel } from "./device-label";

describe("deviceLabel", () => {
  it("names the phone that scanned the QR", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari auf iPhone/iPad");
  });

  it("does not mistake Chrome for Safari", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome auf Android");
  });

  it("does not mistake Edge for Chrome", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      ),
    ).toBe("Edge auf Windows");
  });

  it("says how a session was created when it did not come from a QR", () => {
    // auth.sessions only ever records our own server, so there is genuinely no
    // device to name — say that instead of guessing.
    expect(deviceLabel(null)).toBe("Anmeldung per E-Mail oder Passwort");
    expect(deviceLabel("   ")).toBe("Anmeldung per E-Mail oder Passwort");
  });

  it("falls back rather than rendering an empty row", () => {
    expect(deviceLabel("curl/8.4.0")).toBe("Unbekanntes Gerät");
  });
});
