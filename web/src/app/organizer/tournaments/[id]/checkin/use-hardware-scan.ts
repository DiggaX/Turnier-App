"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import {
  emptyScanBuffer,
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

  useEffect(() => {
    const nextId = () => ++idRef.current;

    const logScan = (entry: Omit<ScanLogEntry, "id" | "at">) =>
      setScans((log) =>
        [{ ...entry, id: nextId(), at: Date.now() }, ...log].slice(
          0,
          SCAN_LOG_CAP,
        ),
      );

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
        const entry: RawKeyEntry = {
          id: nextId(),
          label: e.key === " " ? "␣" : e.key,
          gapMs: lastKeyAtRef.current ? Math.round(at - lastKeyAtRef.current) : 0,
          target: describeTarget(e.target),
          swallowed,
          at: Date.now(),
        };
        setRawKeys((log) => [entry, ...log].slice(0, RAW_LOG_CAP));
      }
      lastKeyAtRef.current = at;

      // A scan aimed at a form field belongs to that field.
      if (swallowed) return;

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
        // Enter would otherwise submit whatever is around it.
        e.preventDefault();
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
  }, [onToken]);

  return { captureRef, rawKeys, scans };
}
