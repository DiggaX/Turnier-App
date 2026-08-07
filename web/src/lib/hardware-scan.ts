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

/**
 * Longest pause between characters still counted as one burst.
 *
 * Not a speed test any more: a scan is accepted because Enter closed it and it
 * reached MIN_SCAN_LENGTH, and this only separates one burst from the next. It
 * used to be 60ms, which collided head-on with DataWedge's Key Event Delay —
 * Zebra recommends at least 50ms for Chrome, so the scanner's own recommended
 * setting had every scan thrown away a character at a time. 500ms clears that
 * with room to spare.
 */
export const MAX_KEY_GAP_MS = 500;

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

/** Why a burst was thrown away — shown in the diagnostics panel, nowhere else. */
export type ScanRejectReason = "too-short" | "no-enter";

export interface ScanStep {
  buf: ScanBuffer;
  /** Set once Enter closes a burst that is long enough to be a real code. */
  scanned?: { text: string; durationMs: number };
  /**
   * Set when characters were discarded. Diagnostics only — a rejected burst
   * never becomes a check-in. Without this, a scanner that arrives in the wrong
   * shape looks exactly like one that never arrived at all.
   */
  rejected?: { text: string; reason: ScanRejectReason };
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
    // An Enter on an empty buffer is just someone pressing Enter: not an event.
    return buf.text === ""
      ? { buf: emptyScanBuffer }
      : {
          buf: emptyScanBuffer,
          rejected: { text: buf.text, reason: "too-short" },
        };
  }

  // Only printable single characters carry barcode data.
  if (key.length !== 1) return { buf };

  // A gap this long means a human, not an injected burst: start over so their
  // keystrokes never accumulate into a phantom scan.
  const continues = buf.text !== "" && at - buf.lastAt <= maxGapMs;
  if (continues) {
    return {
      buf: { text: buf.text + key, lastAt: at, startedAt: buf.startedAt },
    };
  }
  return {
    buf: { text: key, lastAt: at, startedAt: at },
    // Whatever was in the buffer never got its Enter. Say so rather than
    // overwriting it in silence.
    ...(buf.text !== "" && {
      rejected: { text: buf.text, reason: "no-enter" as const },
    }),
  };
}

/**
 * Read a code out of a capture field's value.
 *
 * Android delivers an injected scan through the IME: the characters never
 * arrive as individual key events, they land in whatever field has focus as
 * finished text. So the whole burst shows up in one value — with its
 * terminating newline, and with a second scan behind it whenever the field was
 * not drained fast enough. Take the first line, nothing else.
 */
export function extractScan(value: string): string | null {
  const text = value.split(/[\r\n]/)[0].trim();
  return text.length >= MIN_SCAN_LENGTH ? text : null;
}

/** The <input> types a person actually types characters into. */
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "password",
  "number",
  "tel",
]);

/**
 * Whether a key event came from somewhere the person is deliberately typing.
 * DataWedge injects into whatever has focus, so a scan aimed at a form field
 * should stay in that field rather than also firing a check-in.
 *
 * Which is why this has to be narrow. "Any INPUT or SELECT" also covered the
 * camera picker and the zoom slider — and on Android a <select> keeps focus
 * after it closes, so changing camera once muted scanning for the rest of the
 * session, with nothing on screen to say so.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // Our own capture field: a scan landing there is the whole point of it.
  if (target.hasAttribute("data-scan-capture")) return false;
  if (target.tagName === "TEXTAREA" || target.isContentEditable) return true;
  if (target.tagName === "INPUT") {
    return TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  }
  return false;
}
