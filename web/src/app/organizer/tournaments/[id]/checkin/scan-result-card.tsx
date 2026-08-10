"use client";

import type * as React from "react";
import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatShortDateTime } from "@/lib/format-date";

export type ScanStatus =
  | { kind: "idle" }
  | { kind: "success"; name: string; photoConsent: boolean }
  | { kind: "already"; name: string; since: string; photoConsent: boolean }
  | { kind: "unknown" }
  | { kind: "error" };

export type ResultTone = "lime" | "cyan" | "warn" | "live";

/**
 * What a scan outcome says on screen. Pure, and exported so the wording can be
 * pinned by tests without rendering — these strings are read at a busy door and
 * must not drift.
 *
 * Never called with kind "idle": there is nothing to report yet.
 */
export function resultContent(status: Exclude<ScanStatus, { kind: "idle" }>): {
  tone: ResultTone;
  headline: string;
  detail: string;
} {
  switch (status.kind) {
    // Blau statt grün, wenn eine Fotoerlaubnis vorliegt: das ist am Einlass die
    // eine Sache, die zusätzlich zum "ist drin" beim Blick auf die Karte
    // hängenbleiben muss — Fotografen fragen genau danach.
    case "success":
      return status.photoConsent
        ? {
            tone: "cyan",
            headline: status.name,
            detail: "Eingecheckt · Fotoerlaubnis erteilt",
          }
        : { tone: "lime", headline: status.name, detail: "Eingecheckt" };
    case "already":
      return {
        tone: "warn",
        headline: status.name,
        // Never toLocaleString here: server and browser disagree on the zone and
        // React aborts hydration on the mismatch (see lib/format-date).
        detail:
          `Schon anwesend — seit ${formatShortDateTime(status.since)}` +
          (status.photoConsent ? " · Fotoerlaubnis erteilt" : ""),
      };
    case "unknown":
      return {
        tone: "live",
        headline: "QR nicht erkannt",
        detail: "Der Code gehört zu keinem Teilnehmer.",
      };
    case "error":
      return {
        tone: "live",
        headline: "Check-in fehlgeschlagen",
        detail: "Bitte nochmal versuchen.",
      };
  }
}

/** Spelled out in full — Tailwind cannot see a `bg-${tone}` built at runtime. */
const TONE: Record<
  ResultTone,
  { card: string; icon: string; detail: string; bar: string }
> = {
  lime: {
    card: "border-lime/40 bg-lime/10",
    icon: "text-lime",
    detail: "text-lime",
    bar: "bg-lime",
  },
  cyan: {
    card: "border-cyan/40 bg-cyan/10",
    icon: "text-cyan",
    detail: "text-cyan",
    bar: "bg-cyan",
  },
  warn: {
    card: "border-warn/40 bg-warn/10",
    icon: "text-warn",
    // Only "already" is amber, and its detail is a timestamp: it reads better
    // muted than shouted, with the border and icon carrying the warning.
    detail: "text-fg-muted",
    bar: "bg-warn",
  },
  live: {
    card: "border-live/40 bg-live/10",
    icon: "text-live",
    detail: "text-live",
    bar: "bg-live",
  },
};

const ICON: Record<
  Exclude<ScanStatus, { kind: "idle" }>["kind"],
  LucideIcon
> = {
  success: CheckCircle2,
  already: AlertTriangle,
  unknown: XCircle,
  error: XCircle,
};

/**
 * The result of the last scan, shown until a countdown runs out.
 *
 * `nonce` increments on every scan so two identical outcomes in a row still
 * restart the countdown and replay the bar — without it, scanning the same
 * badge twice would look like nothing happened.
 */
export function ScanResultCard({
  status,
  nonce,
  onExpire,
  durationMs = 4000,
  variant = "inline",
}: {
  status: ScanStatus;
  /** increments on every scan; restarts countdown + animation */
  nonce: number;
  /** called once when the countdown elapses; parent resets to idle */
  onExpire: () => void;
  durationMs?: number;
  /**
   * "inline" sits in the page flow and shows a visible idle line. "overlay"
   * floats over the live camera image: idle renders nothing visible (the video
   * itself says "ready"), and a result gets an opaque backing so it stays
   * readable over whatever the camera shows.
   */
  variant?: "inline" | "overlay";
}): React.JSX.Element {
  useEffect(() => {
    if (status.kind === "idle") return;
    const timer = setTimeout(onExpire, durationMs);
    return () => clearTimeout(timer);
    // onExpire is left out on purpose: an inline arrow from the parent changes
    // identity every render and would keep restarting the countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, status.kind, durationMs]);

  const overlay = variant === "overlay";

  return (
    // Mounted even while idle and even as an overlay: an aria-live region that
    // appears together with its first message is announced inconsistently.
    <div
      aria-live="polite"
      role="status"
      className={
        overlay ? "" : "flex min-h-[7rem] flex-col justify-center"
      }
    >
      {status.kind === "idle" ? (
        overlay ? (
          <span className="sr-only">Bereit zum Scannen</span>
        ) : (
          <p className="text-center text-sm text-fg-muted">
            Bereit zum Scannen…
          </p>
        )
      ) : (
        <ResultCard
          status={status}
          nonce={nonce}
          durationMs={durationMs}
          overlay={overlay}
        />
      )}
    </div>
  );
}

function ResultCard({
  status,
  nonce,
  durationMs,
  overlay,
}: {
  status: Exclude<ScanStatus, { kind: "idle" }>;
  nonce: number;
  durationMs: number;
  overlay: boolean;
}): React.JSX.Element {
  const { tone, headline, detail } = resultContent(status);
  const cls = TONE[tone];
  const Icon = ICON[status.kind];

  const card = (
    <div className={`rounded-xl border p-5 text-center ${cls.card}`}>
      <Icon className={`mx-auto size-10 ${cls.icon}`} aria-hidden="true" />
      <p className="mt-3 font-display text-xl font-bold text-ink">{headline}</p>
      <p className={`mt-1 text-sm ${cls.detail}`}>{detail}</p>
      <div
        // Remounting is what makes the animation replay per scan.
        key={nonce}
        className={`mt-4 h-1 origin-left rounded-full ${cls.bar}`}
        style={{ animation: `scan-countdown ${durationMs}ms linear forwards` }}
      />
    </div>
  );

  if (!overlay) return card;

  // The tone fill is translucent, so over a live camera image the video shows
  // through and eats the text. A solid layer underneath fixes that — as its own
  // element, because two competing background utilities on one node are decided
  // by stylesheet order, not by the order they are written in the class string.
  return (
    <div className="rounded-xl bg-surface shadow-lg">{card}</div>
  );
}
