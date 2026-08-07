/**
 * Audible check-in feedback.
 *
 * At a door the person scanning is looking at the queue, not the screen, so the
 * three outcomes have to be tellable apart with the ears alone: a rising pair
 * for a fresh check-in, a flat double blip for someone already inside, and a
 * low buzz for a refusal.
 */

export type ScanOutcome = "success" | "already" | "reject";

/** Frequencies in Hz, played in sequence, and how long each note lasts. */
export const SCAN_TONES: Record<
  ScanOutcome,
  { notes: number[]; noteMs: number }
> = {
  // Rising — "in you go".
  success: { notes: [880, 1320], noteMs: 90 },
  // Same note twice, mid-range: a nudge, not a celebration and not an alarm.
  already: { notes: [660, 660], noteMs: 110 },
  // Low and long enough to carry over a noisy room.
  reject: { notes: [200, 160], noteMs: 200 },
};

let context: AudioContext | null = null;

/**
 * Play the tone for an outcome. Best-effort throughout: audio is a nicety, and
 * a browser that blocks it must not take the check-in down with it.
 *
 * The context is created lazily on the first scan — by then the page has been
 * interacted with, which is what iOS requires before it will make a sound.
 */
export function playScanSound(outcome: ScanOutcome): void {
  const tone = SCAN_TONES[outcome];
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();

    tone.notes.forEach((freq, i) => {
      const startAt = context!.currentTime + (i * tone.noteMs) / 1000;
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      // Ramp the tail off; a hard stop on a square wave clicks.
      gain.gain.setValueAtTime(0.12, startAt);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        startAt + tone.noteMs / 1000,
      );
      osc.connect(gain).connect(context!.destination);
      osc.start(startAt);
      osc.stop(startAt + tone.noteMs / 1000);
    });
  } catch {
    // No audio (blocked, unsupported, or no output device) — the on-screen
    // status still says what happened.
  }
}
