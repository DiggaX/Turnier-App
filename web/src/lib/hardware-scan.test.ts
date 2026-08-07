/**
 * The risk here is a false positive: this listens on the whole document, so
 * ordinary typing must never accumulate into a check-in.
 */
import { describe, it, expect } from "vitest";

import {
  emptyScanBuffer,
  MAX_KEY_GAP_MS,
  MIN_SCAN_LENGTH,
  pushScanKey,
  type ScanBuffer,
} from "./hardware-scan";

/** Feed a string as one machine-fast burst, optionally closing it with Enter. */
function burst(text: string, opts: { gapMs?: number; enter?: boolean } = {}) {
  const gap = opts.gapMs ?? 5;
  let buf: ScanBuffer = emptyScanBuffer;
  let at = 1000;
  let scanned;
  let rejected;
  for (const ch of text) {
    at += gap;
    ({ buf, scanned, rejected } = pushScanKey(buf, ch, at));
  }
  if (opts.enter !== false) {
    at += gap;
    ({ buf, scanned, rejected } = pushScanKey(buf, "Enter", at));
  }
  return { buf, scanned, rejected };
}

const TOKEN = "75f01f1c-863c-4ff0-be2a-f43c19c7830a";

describe("pushScanKey", () => {
  it("emits a token fed at machine speed and closed with Enter", () => {
    const { scanned } = burst(TOKEN);
    expect(scanned?.text).toBe(TOKEN);
  });

  it("reports how long the burst took, so the UI can show it", () => {
    const { scanned } = burst("ABCDEFGH", { gapMs: 4 });
    expect(scanned?.durationMs).toBeGreaterThan(0);
    expect(scanned?.durationMs).toBeLessThan(100);
  });

  it("clears the buffer after emitting, so two scans stay separate", () => {
    const { buf } = burst(TOKEN);
    expect(buf).toEqual(emptyScanBuffer);
  });

  it("never accumulates human typing into a scan", () => {
    // A person managing a brisk 150ms per key still exceeds the gap.
    const { scanned } = burst("hallo welt", { gapMs: 150 });
    expect(scanned).toBeUndefined();
  });

  it("restarts the burst after a pause instead of splicing it", () => {
    let buf: ScanBuffer = emptyScanBuffer;
    ({ buf } = pushScanKey(buf, "A", 1000));
    ({ buf } = pushScanKey(buf, "B", 1005));
    // Long pause — what follows is a new burst, not "ABC".
    ({ buf } = pushScanKey(buf, "C", 5000));
    expect(buf.text).toBe("C");
  });

  it("ignores a lone Enter", () => {
    const { scanned } = pushScanKey(emptyScanBuffer, "Enter", 1000);
    expect(scanned).toBeUndefined();
  });

  it("drops a burst too short to be a code", () => {
    const short = "a".repeat(MIN_SCAN_LENGTH - 1);
    expect(burst(short).scanned).toBeUndefined();
  });

  it("accepts one exactly at the minimum length", () => {
    const exact = "a".repeat(MIN_SCAN_LENGTH);
    expect(burst(exact).scanned?.text).toBe(exact);
  });

  it("ignores modifier and navigation keys mixed into the burst", () => {
    let buf: ScanBuffer = emptyScanBuffer;
    let scanned;
    let at = 1000;
    for (const key of ["A", "Shift", "B", "Control", "C", "Tab"]) {
      at += 5;
      ({ buf, scanned } = pushScanKey(buf, key, at));
    }
    expect(buf.text).toBe("ABC");
    expect(scanned).toBeUndefined();
  });

  it("holds the gap right at the boundary", () => {
    let buf: ScanBuffer = emptyScanBuffer;
    ({ buf } = pushScanKey(buf, "A", 1000));
    ({ buf } = pushScanKey(buf, "B", 1000 + MAX_KEY_GAP_MS));
    expect(buf.text).toBe("AB");

    let other: ScanBuffer = emptyScanBuffer;
    ({ buf: other } = pushScanKey(other, "A", 1000));
    ({ buf: other } = pushScanKey(other, "B", 1001 + MAX_KEY_GAP_MS));
    expect(other.text).toBe("B");
  });
});

/**
 * Dropping a burst silently is what made the scanner impossible to diagnose on
 * the device: nothing arrived, and nothing said why. These reasons are for the
 * diagnostics panel only — a rejected burst never becomes a check-in.
 */
describe("pushScanKey rejections", () => {
  it("names a burst that Enter closed while it was too short", () => {
    const short = "a".repeat(MIN_SCAN_LENGTH - 1);
    let buf: ScanBuffer = emptyScanBuffer;
    let at = 1000;
    for (const ch of short) {
      at += 5;
      ({ buf } = pushScanKey(buf, ch, at));
    }
    const step = pushScanKey(buf, "Enter", at + 5);

    expect(step.rejected).toEqual({ text: short, reason: "too-short" });
    expect(step.buf).toEqual(emptyScanBuffer);
  });

  it("stays quiet on a lone Enter — a person pressing Enter is not an event", () => {
    const step = pushScanKey(emptyScanBuffer, "Enter", 1000);
    expect(step.rejected).toBeUndefined();
    expect(step.scanned).toBeUndefined();
  });

  it("hands back the abandoned text when a new burst starts without Enter", () => {
    let buf: ScanBuffer = emptyScanBuffer;
    ({ buf } = pushScanKey(buf, "A", 1000));
    ({ buf } = pushScanKey(buf, "B", 1005));
    const step = pushScanKey(buf, "C", 5000);

    expect(step.rejected).toEqual({ text: "AB", reason: "no-enter" });
    expect(step.buf.text).toBe("C");
  });

  it("says nothing while a burst is still running", () => {
    let buf: ScanBuffer = emptyScanBuffer;
    ({ buf } = pushScanKey(buf, "A", 1000));
    expect(pushScanKey(buf, "B", 1005).rejected).toBeUndefined();
  });

  it("says nothing about the first key of a burst", () => {
    expect(pushScanKey(emptyScanBuffer, "A", 1000).rejected).toBeUndefined();
  });

  it("does not flag an accepted scan", () => {
    const { scanned, rejected } = burst(TOKEN);
    expect(scanned?.text).toBe(TOKEN);
    expect(rejected).toBeUndefined();
  });
});
