/**
 * What makes a burst a scan is Enter plus MIN_SCAN_LENGTH — not how fast it
 * was typed. Telling a machine apart from a person by timing sounded right and
 * was the bug: DataWedge's own recommended key delay looked human, so every
 * scan was dropped. The gap only separates one burst from the next now, and
 * text nobody scanned is caught downstream, where an unknown code is a lookup
 * that fails rather than a keystroke that vanishes.
 */
import { describe, it, expect } from "vitest";

import {
  emptyScanBuffer,
  extractScan,
  isTypingTarget,
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

  it("emits one paced by DataWedge's key event delay", () => {
    // The regression this whole fix started from: Zebra recommends a Key Event
    // Delay of at least 50ms for Chrome, and real profiles sit around 100 — so
    // the scanner's own recommended setting fell outside the old 60ms gap and
    // every single scan was dropped a character at a time.
    expect(burst(TOKEN, { gapMs: 100 }).scanned?.text).toBe(TOKEN);
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

  it("emits hand-typed text too, once Enter closes it", () => {
    // Deliberate: the gate is Enter plus MIN_SCAN_LENGTH, not typing speed.
    // Safe because a participant token is a 36-character UUID — anything a
    // person types reaches the same lookup and comes back "QR nicht erkannt",
    // which is also what makes the diagnostics panel testable by hand.
    expect(burst("hallo welt!", { gapMs: 150 }).scanned?.text).toBe(
      "hallo welt!",
    );
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

/**
 * The second channel. Android hands an injected scan to the page through the
 * IME, where it arrives as text in a focused field instead of as single keys —
 * so all we get to look at is the field's value, terminator and all.
 */
describe("extractScan", () => {
  it("reads a token straight out of the field", () => {
    expect(extractScan(TOKEN)).toBe(TOKEN);
  });

  it("drops the newline the scanner appends", () => {
    expect(extractScan(`${TOKEN}\n`)).toBe(TOKEN);
  });

  it("trims padding around the code", () => {
    expect(extractScan(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it("takes the first line when a second scan lands before the field was drained", () => {
    expect(extractScan(`${TOKEN}\n8f2b1d40-0000-4000-8000-000000000000`)).toBe(
      TOKEN,
    );
  });

  it("splits on a carriage return too — some scanners terminate with one", () => {
    expect(extractScan(`${TOKEN}\r8f2b1d40-0000-4000-8000-000000000000`)).toBe(
      TOKEN,
    );
  });

  it("ignores a field too short to hold a code", () => {
    expect(extractScan("a".repeat(MIN_SCAN_LENGTH - 1))).toBeNull();
  });

  it("ignores an empty field", () => {
    expect(extractScan("")).toBeNull();
  });
});

/**
 * Which targets a scan belongs to rather than to the check-in. DataWedge fires
 * into whatever holds focus, so this is the switch that mutes the keydown
 * channel — and answering "any INPUT or SELECT" muted it for good: on Android
 * the camera picker keeps focus after it closes, so the first camera change
 * ended scanning for the rest of the session, and the zoom slider did the same.
 */
describe("isTypingTarget", () => {
  /** Typeless on purpose when no type is given — that input reports "text". */
  function input(type: string) {
    const el = document.createElement("input");
    if (type) el.type = type;
    return el;
  }

  it("counts the fields a person types into", () => {
    const typed = ["text", "search", "email", "url", "password", "number", "tel"];
    for (const type of ["", ...typed]) {
      expect(isTypingTarget(input(type))).toBe(true);
    }
  });

  it("counts a textarea", () => {
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
  });

  it("counts a contenteditable element", () => {
    const el = document.createElement("div");
    // jsdom carries the attribute but never computes isContentEditable, so the
    // property has to be stood up by hand here. The real one is a browser's.
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isTypingTarget(el)).toBe(true);
  });

  it("leaves the camera picker alone", () => {
    expect(isTypingTarget(document.createElement("select"))).toBe(false);
  });

  it("leaves inputs nobody types into alone", () => {
    for (const type of ["range", "checkbox", "radio"]) {
      expect(isTypingTarget(input(type))).toBe(false);
    }
  });

  it("leaves a button alone", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });

  it("never counts our own capture field", () => {
    // It is a text input, and it is exactly where a scan is meant to land.
    const el = input("text");
    el.setAttribute("data-scan-capture", "");
    expect(isTypingTarget(el)).toBe(false);
  });

  it("ignores a target that is not an element", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
