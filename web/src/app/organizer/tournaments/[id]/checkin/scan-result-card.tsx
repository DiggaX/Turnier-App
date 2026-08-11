"use client";

import type * as React from "react";
import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, UserPlus, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatShortDateTime } from "@/lib/format-date";

export type ScanStatus =
  | { kind: "idle" }
  | { kind: "success"; name: string; photoConsent: boolean }
  | { kind: "already"; name: string; since: string; photoConsent: boolean }
  | { kind: "unknown" }
  /**
   * Gültiger QR, aber aus einem anderen Turnier derselben Organisation — der
   * Klassiker: jemand kommt mit dem Code vom letzten Mal. Eigener Zustand, weil
   * „nicht erkannt" hier falsch wäre und die Orga nach einem Anmeldeproblem
   * suchen ließe, das es nicht gibt.
   */
  | { kind: "otherTournament"; name: string; tournament: string }
  /**
   * Wie `otherTournament`, aber die Übernahme ist möglich: Schalter an, die
   * Quelle hat ein Konto und ist keine Team-Zeile. Wartet auf eine Entscheidung
   * — dieser Zustand ist der einzige, bei dem der Countdown NICHT läuft.
   */
  | { kind: "carryOverOffer"; name: string; tournament: string; token: string }
  | { kind: "carriedOver"; name: string }
  | { kind: "carryOverFailed"; reason: string }
  | { kind: "error" };

/** Zustände, die auf eine Eingabe warten und deshalb nicht von allein gehen. */
export function awaitsDecision(status: ScanStatus): boolean {
  return status.kind === "carryOverOffer";
}

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
    case "otherTournament":
      return {
        tone: "live",
        headline: status.name,
        detail: `Gehört zu „${status.tournament}" — für dieses Turnier nicht angemeldet.`,
      };
    // Bernstein statt Rot: das ist eine Frage, keine Ablehnung.
    case "carryOverOffer":
      return {
        tone: "warn",
        headline: status.name,
        detail: `Angemeldet für „${status.tournament}". In dieses Turnier übernehmen?`,
      };
    // Eigener Zustand statt "success": „Eingecheckt" verschwiege die zwei Dinge,
    // die am Tresen zählen — es ist gerade eine Anmeldung entstanden, und die
    // Fotofrage ist offen. Eine Einwilligung wird nie mitkopiert, sie fehlt also
    // immer; das steht hier fest und wird nicht berechnet.
    case "carriedOver":
      return {
        tone: "lime",
        headline: status.name,
        detail: "Übernommen und eingecheckt · keine Fotoerlaubnis",
      };
    case "carryOverFailed":
      return {
        tone: "live",
        headline: "Übernahme fehlgeschlagen",
        detail: status.reason,
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
  otherTournament: XCircle,
  carryOverOffer: UserPlus,
  carriedOver: CheckCircle2,
  carryOverFailed: XCircle,
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
  actions,
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
  /**
   * Knöpfe unter der Meldung. Nur für Zustände gedacht, die auf eine
   * Entscheidung warten — dort läuft kein Countdown, der sie wegnehmen könnte.
   */
  actions?: React.ReactNode;
}): React.JSX.Element {
  useEffect(() => {
    // Ein wartender Zustand wird durch die Entscheidung beendet, nicht durch
    // eine Uhr. Ohne diese Bedingung verschwände die Karte unter dem Daumen.
    if (status.kind === "idle" || awaitsDecision(status)) return;
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
          actions={actions}
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
  actions,
}: {
  status: Exclude<ScanStatus, { kind: "idle" }>;
  nonce: number;
  durationMs: number;
  overlay: boolean;
  actions?: React.ReactNode;
}): React.JSX.Element {
  const { tone, headline, detail } = resultContent(status);
  const cls = TONE[tone];
  const Icon = ICON[status.kind];
  const waiting = awaitsDecision(status);

  const card = (
    <div className={`rounded-xl border p-5 text-center ${cls.card}`}>
      <Icon className={`mx-auto size-10 ${cls.icon}`} aria-hidden="true" />
      <p className="mt-3 font-display text-xl font-bold text-ink">{headline}</p>
      <p className={`mt-1 text-sm ${cls.detail}`}>{detail}</p>

      {actions && (
        // pointer-events-auto ist Pflicht: der Overlay-Container liegt auf
        // pointer-events-none, damit Tipper aufs Kamerabild durchfallen. Nur
        // diese Leiste holt sie zurück, nicht die ganze Karte.
        <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-2">
          {actions}
        </div>
      )}

      {/* Kein Balken, solange auf eine Entscheidung gewartet wird — er zeigte
          eine ablaufende Frist an, die es nicht gibt. */}
      {!waiting && (
        <div
          // Remounting is what makes the animation replay per scan.
          key={nonce}
          className={`mt-4 h-1 origin-left rounded-full ${cls.bar}`}
          style={{ animation: `scan-countdown ${durationMs}ms linear forwards` }}
        />
      )}
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
