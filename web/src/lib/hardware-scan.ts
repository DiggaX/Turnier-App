/**
 * Reading a hardware barcode engine, the kind built into a Zebra TC26 and
 * friends.
 *
 * That engine is not a camera and never appears in getUserMedia: Zebra's
 * DataWedge service captures the scan and replays it as keystrokes, ending with
 * Enter. So the job here is telling a burst of injected keys apart from someone
 * typing — a scanner fires its characters within a few milliseconds of each
 * other, a person cannot.
 */

/** Longest pause between characters still counted as one machine-fed burst. */
export const MAX_KEY_GAP_MS = 60;

/**
 * Shortest accepted scan. Participant tokens are UUIDs, but keeping this low
 * leaves room for other codes rather than silently dropping them.
 */
export const MIN_SCAN_LENGTH = 6;

export interface ScanBuffer {
  text: string;
  lastAt: number;
  /** When the current burst started — lets the UI show how fast it arrived. */
  startedAt: number;
}

export const emptyScanBuffer: ScanBuffer = { text: "", lastAt: 0, startedAt: 0 };

export interface ScanStep {
  buf: ScanBuffer;
  /** Set once Enter closes a burst that is long enough to be a real code. */
  scanned?: { text: string; durationMs: number };
}

/**
 * Feed one key into the buffer.
 *
 * `key` is a KeyboardEvent.key: single printable characters extend the burst,
 * Enter closes it, everything else (Shift, Tab, …) is ignored.
 */
export function pushScanKey(
  buf: ScanBuffer,
  key: string,
  at: number,
  maxGapMs: number = MAX_KEY_GAP_MS,
): ScanStep {
  if (key === "Enter") {
    if (buf.text.length >= MIN_SCAN_LENGTH) {
      return {
        buf: emptyScanBuffer,
        scanned: { text: buf.text, durationMs: at - buf.startedAt },
      };
    }
    // Too short to be a scan — an Enter from a person, so drop what we had.
    return { buf: emptyScanBuffer };
  }

  // Only printable single characters carry barcode data.
  if (key.length !== 1) return { buf };

  // A gap this long means a human, not an injected burst: start over so their
  // keystrokes never accumulate into a phantom scan.
  const continues = buf.text !== "" && at - buf.lastAt <= maxGapMs;
  return {
    buf: continues
      ? { text: buf.text + key, lastAt: at, startedAt: buf.startedAt }
      : { text: key, lastAt: at, startedAt: at },
  };
}

/**
 * Whether a key event came from somewhere the person is deliberately typing.
 * DataWedge injects into whatever has focus, so a scan aimed at a form field
 * should stay in that field rather than also firing a check-in.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}
