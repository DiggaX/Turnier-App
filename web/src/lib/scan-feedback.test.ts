/**
 * The person on the door listens rather than watches, so the three outcomes
 * have to be distinguishable by ear — a re-scan must not sound like a fresh
 * admission.
 */
import { describe, it, expect } from "vitest";

import { SCAN_TONES, type ScanOutcome } from "./scan-feedback";

const OUTCOMES: ScanOutcome[] = ["success", "already", "reject"];

describe("SCAN_TONES", () => {
  it("gives every outcome its own pitch", () => {
    const firstNotes = OUTCOMES.map((o) => SCAN_TONES[o].notes[0]);
    expect(new Set(firstNotes).size).toBe(OUTCOMES.length);
  });

  it("does not let a re-scan share the success melody", () => {
    expect(SCAN_TONES.already.notes).not.toEqual(SCAN_TONES.success.notes);
  });

  it("only lets the success tone rise", () => {
    const [a, b] = SCAN_TONES.success.notes;
    expect(b).toBeGreaterThan(a);
    for (const outcome of ["already", "reject"] as const) {
      const [x, y] = SCAN_TONES[outcome].notes;
      expect(y).toBeLessThanOrEqual(x);
    }
  });

  it("keeps a refusal below the others so it reads as wrong", () => {
    expect(Math.max(...SCAN_TONES.reject.notes)).toBeLessThan(
      Math.min(...SCAN_TONES.success.notes),
    );
    expect(Math.max(...SCAN_TONES.reject.notes)).toBeLessThan(
      Math.min(...SCAN_TONES.already.notes),
    );
  });

  it("stays short enough not to lag a queue", () => {
    for (const outcome of OUTCOMES) {
      const tone = SCAN_TONES[outcome];
      expect(tone.notes.length * tone.noteMs).toBeLessThanOrEqual(500);
    }
  });
});
