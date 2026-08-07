"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  emptyScanBuffer,
  extractScan,
  isTypingTarget,
  MAX_KEY_GAP_MS,
  pushScanKey,
  type ScanBuffer,
} from "@/lib/hardware-scan";

/** One key exactly as it reached the page, before any filtering. */
export interface RawKeyEntry {
  id: number;
  label: string;
  gapMs: number;
  target: string;
  /** Went to a field someone is typing in, so the scan channel ignored it. */
  swallowed: boolean;
  at: number;
}

export interface ScanLogEntry {
  id: number;
  text: string;
  channel: "tasten" | "text";
  outcome: "ok" | "too-short" | "no-enter";
  durationMs?: number;
  at: number;
}

/** Newest first — long enough to hold a whole burst, short enough to read. */
const RAW_LOG_CAP = 20;
const SCAN_LOG_CAP = 10;

/** How long a half-finished burst may sit before we call it abandoned. */
const STALE_FLUSH_MS = MAX_KEY_GAP_MS + 100;

/** Where a key landed, in the terms the person debugging it can see on screen. */
function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof HTMLElement)) return "Dokument";
  const tag = target.tagName.toLowerCase();
  if (target instanceof HTMLInputElement) return `${tag}[${target.type}]`;
  return target.id ? `${tag}#${target.id}` : tag;
}

/**
 * The keyboard side of check-in: a handheld like the Zebra TC26 scans with a
 * laser imager that never appears in getUserMedia, and DataWedge replays the
 * code as keystrokes ending with Enter.
 *
 * It also keeps the two logs the diagnostics panel shows. Those are the point:
 * when a scan does not arrive, the only way to tell "nothing reached the
 * browser" from "it arrived and we dropped it" is to record both.
 */
export function useHardwareScan(
  onToken: (token: string) => void,
  opts: { rawLogEnabled: boolean },
): {
  captureRef: RefObject<HTMLInputElement | null>;
  rawKeys: RawKeyEntry[];
  scans: ScanLogEntry[];
} {
  const captureRef = useRef<HTMLInputElement | null>(null);
  const [rawKeys, setRawKeys] = useState<RawKeyEntry[]>([]);
  const [scans, setScans] = useState<ScanLogEntry[]>([]);

  // Recording every key re-renders the page some forty times per burst, so the
  // raw channel only runs while the panel showing it is open. Kept in a ref
  // rather than a dependency: toggling the panel must not tear the listener
  // down mid-scan.
  const rawEnabledRef = useRef(opts.rawLogEnabled);
  useEffect(() => {
    rawEnabledRef.current = opts.rawLogEnabled;
  }, [opts.rawLogEnabled]);

  const bufRef = useRef<ScanBuffer>(emptyScanBuffer);
  const lastKeyAtRef = useRef(0);
  // React keys: within one burst several entries share a millisecond, and
  // `Date.now()` as a key then collapses them into one row.
  const idRef = useRef(0);

  // Both channels write into the same two logs, so these sit above the effects
  // instead of inside either one. Stable identities: the effects keep them
  // across renders and must not be torn down for it.
  const logScan = useCallback(
    (entry: Omit<ScanLogEntry, "id" | "at">) => {
      const row = { ...entry, id: ++idRef.current, at: Date.now() };
      setScans((log) => [row, ...log].slice(0, SCAN_LOG_CAP));
    },
    [],
  );

  const logRawKey = useCallback((entry: Omit<RawKeyEntry, "id" | "at">) => {
    const row = { ...entry, id: ++idRef.current, at: Date.now() };
    setRawKeys((log) => [row, ...log].slice(0, RAW_LOG_CAP));
  }, []);

  useEffect(() => {
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    // A burst whose Enter never comes would sit in the buffer until the next
    // scan silently overwrote it. Say so instead — a missing ENTER suffix is
    // one of the DataWedge settings people get wrong.
    const flushStale = () => {
      const { text } = bufRef.current;
      if (!text) return;
      bufRef.current = emptyScanBuffer;
      logScan({ text, channel: "tasten", outcome: "no-enter" });
    };

    function onKeyDown(e: KeyboardEvent) {
      // One clock, always. `e.timeStamp` counts from the page's time origin and
      // `Date.now()` from 1970, so falling back from one to the other turned
      // every gap into a number in the trillions.
      const at = e.timeStamp || performance.now();
      const swallowed = isTypingTarget(e.target);

      // Recorded before that verdict, deliberately: a scan that lands in a
      // focused field, or arrives as "Unidentified" through Android's IME
      // path, is otherwise indistinguishable from nothing arriving at all.
      if (rawEnabledRef.current) {
        logRawKey({
          label: e.key === " " ? "␣" : e.key,
          gapMs: lastKeyAtRef.current
            ? Math.round(at - lastKeyAtRef.current)
            : 0,
          target: describeTarget(e.target),
          swallowed,
        });
      }
      lastKeyAtRef.current = at;

      // A scan aimed at a form field belongs to that field.
      if (swallowed) return;

      // Any Enter closing a burst is the scanner's terminator, whether or not
      // the burst turns out long enough to keep — and left to its default it
      // clicks whatever button has focus, which on this page means "Zurücksetzen"
      // and a confirm dialog mid-scan. A lone Enter keeps its default: that one
      // is a person navigating by keyboard.
      if (e.key === "Enter" && bufRef.current.text) e.preventDefault();

      const step = pushScanKey(bufRef.current, e.key, at);
      bufRef.current = step.buf;

      if (step.rejected) {
        logScan({
          text: step.rejected.text,
          channel: "tasten",
          outcome: step.rejected.reason,
        });
      }

      if (step.scanned) {
        const { text, durationMs } = step.scanned;
        logScan({ text, channel: "tasten", outcome: "ok", durationMs });
        onToken(text);
      }

      clearTimeout(flushTimer);
      if (bufRef.current.text) {
        flushTimer = setTimeout(flushStale, STALE_FLUSH_MS);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(flushTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onToken, logScan, logRawKey]);

  // The second channel, and on Android the one that carries the scan at all:
  // there the injected characters go through the IME, which commits them as
  // finished text into the focused field. No field, no text — the page never
  // sees a key event worth the name. So we hold a field focused and read it.
  useEffect(() => {
    const input = captureRef.current;
    if (!input) return;

    let commitTimer: ReturnType<typeof setTimeout> | undefined;
    let refocusTimer: ReturnType<typeof setTimeout> | undefined;
    // How much of the field we have already logged, so each event reports what
    // this event brought rather than the running total.
    let logged = 0;

    const commit = () => {
      clearTimeout(commitTimer);
      const raw = input.value;
      input.value = "";
      logged = 0;

      const text = extractScan(raw);
      if (text) {
        logScan({ text, channel: "text", outcome: "ok" });
        onToken(text);
      } else if (raw.trim()) {
        logScan({ text: raw.trim(), channel: "text", outcome: "too-short" });
      }
    };

    const onInput = (e: Event) => {
      const at = e.timeStamp || performance.now();
      if (rawEnabledRef.current) {
        logRawKey({
          label: `+${input.value.length - logged} Zeichen`,
          gapMs: lastKeyAtRef.current
            ? Math.round(at - lastKeyAtRef.current)
            : 0,
          target: "Scan-Feld",
          swallowed: false,
        });
      }
      lastKeyAtRef.current = at;
      logged = input.value.length;

      // A terminator already in the value means the burst is complete.
      if (/[\r\n]/.test(input.value)) return commit();

      // Otherwise wait out the gap: an IME commit can arrive in several events,
      // and some profiles send no ENTER at all.
      clearTimeout(commitTimer);
      commitTimer = setTimeout(commit, MAX_KEY_GAP_MS);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // Enter inside a field submits whatever surrounds it.
      e.preventDefault();
      commit();
    };

    // Never take focus away from someone. Only claim it when it is nowhere —
    // if they are in the camera picker or a text field, their next keystroke
    // belongs there.
    const claimFocus = () => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      input.focus({ preventScroll: true });
    };

    // focusout fires before the next element has focus, so ask a tick later.
    const onFocusOut = () => {
      clearTimeout(refocusTimer);
      refocusTimer = setTimeout(claimFocus, 0);
    };

    // Coming back from a locked screen or another tab leaves focus nowhere.
    const onVisibility = () => {
      if (document.visibilityState === "visible") claimFocus();
    };

    claimFocus();
    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("input", onInput);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(commitTimer);
      clearTimeout(refocusTimer);
      input.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("input", onInput);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [onToken, logScan, logRawKey]);

  return { captureRef, rawKeys, scans };
}
