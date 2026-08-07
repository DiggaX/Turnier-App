/**
 * The scanner used to pass no `onError` to the camera component, so every
 * failure — a dismissed permission prompt above all — left the frame overlay
 * sitting there with no video and no explanation. These cover the mapping that
 * turns each failure into something the check-in desk can act on.
 */
import { describe, it, expect } from "vitest";
import type { ScannerErrorKind } from "@yudiel/react-qr-scanner";

import { cameraErrorMessage, cameraLabel } from "./scanner-client";

describe("cameraErrorMessage", () => {
  it("tells the user how to undo a blocked permission", () => {
    expect(cameraErrorMessage("permission-denied")).toContain("Adressleiste");
  });

  it("points at the camera picker when the chosen lens is gone", () => {
    expect(cameraErrorMessage("overconstrained")).toContain("andere");
  });

  it("names the other program holding the camera", () => {
    expect(cameraErrorMessage("in-use")).toContain("anderen Programm");
  });

  it("covers every error kind the library can raise", () => {
    const kinds: ScannerErrorKind[] = [
      "permission-denied",
      "no-camera",
      "in-use",
      "overconstrained",
      "insecure-context",
      "unsupported",
      "aborted",
      "security",
      "type-error",
      "unknown",
    ];
    for (const kind of kinds) {
      const message = cameraErrorMessage(kind);
      expect(message.length).toBeGreaterThan(10);
      // Never leak the raw kind — these strings are read by staff mid-event.
      expect(message).not.toContain(kind);
    }
  });
});

describe("cameraLabel", () => {
  /** Browsers hide device labels until camera permission has been granted. */
  function device(label: string): MediaDeviceInfo {
    return { label, deviceId: "d", kind: "videoinput", groupId: "g" } as MediaDeviceInfo;
  }

  it("uses the device label when the browser exposes one", () => {
    expect(cameraLabel(device("Back Ultra Wide Camera"), 0)).toBe(
      "Back Ultra Wide Camera",
    );
  });

  it("falls back to a position so entries are never blank", () => {
    expect(cameraLabel(device(""), 0)).toBe("Kamera 1");
    expect(cameraLabel(device("   "), 1)).toBe("Kamera 2");
  });
});
