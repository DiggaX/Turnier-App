"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { generateWarning } from "@/lib/bracket/generate-warning";
import { lostWork } from "@/lib/bracket/regenerate-warning";

import { generateBracket } from "./actions";

export type GenerateButtonProps = {
  tournamentId: string;
  /** When true, the bracket already exists — warn that this replaces it. */
  regenerate?: boolean;
  /** Released results this regenerate would delete. */
  decidedCount?: number;
  /** Matches currently being counted, which it would delete too. */
  liveCount?: number;
  /** Pending matches carrying player reports, which cascade away with them. */
  reportedCount?: number;
  /** Eingecheckte Spieler ohne Team — sie bekommen kein Match. */
  orphanNames?: string[];
  /** Teams ohne Check-in — sie werden beim Generieren uebergangen. */
  notReadyTeamNames?: string[];
};

/**
 * Triggers bracket generation for a tournament. Shows a pending state and any
 * error, and refreshes the route on success so the new bracket renders.
 *
 * Vor dem Generieren stehen zwei verschiedene Warnungen, und sie duerfen nicht
 * zu einer verschmelzen:
 *  - was das Generieren ZERSTOERT (nur beim Neu-Generieren: freigegebene
 *    Ergebnisse, laufende Spiele, gemeldete Ergebnisse) — Bestaetigen ist hier
 *    zugleich der Schluessel fuer den Riegel im Server (`discardResults`),
 *  - wer beim Generieren DRAUSSEN BLEIBT (Spieler ohne Team, Teams ohne
 *    Check-in). Das kostet nichts Bestehendes, aber es hat live zwoelf
 *    eingecheckte Kinder aus dem Turnier gehalten, ohne dass irgendwo ein Name
 *    stand. Deshalb: Namen sichtbar, und ein Haekchen, das den Knopf freigibt —
 *    ein Dialog, den man blind wegklickt, haette den Vorfall nicht verhindert.
 *
 * Das Haekchen gilt NUR fuer die zweite Sorte. Ein Riegel ist es trotzdem
 * nicht: wer bestaetigt, generiert. Manche Kinder sind eben schon weg.
 */
export function GenerateButton({
  tournamentId,
  regenerate = false,
  decidedCount = 0,
  liveCount = 0,
  reportedCount = 0,
  orphanNames = [],
  notReadyTeamNames = [],
}: GenerateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [acked, setAcked] = useState(false);

  const lost = regenerate
    ? lostWork(decidedCount, liveCount, reportedCount)
    : null;
  const skipped = generateWarning({ orphanNames, notReadyTeamNames });

  // Ohne Warnung und ohne bestehendes Bracket ist Generieren harmlos — dann
  // steht kein Dialog im Weg, genau wie bisher.
  const needsConfirm = regenerate || skipped !== null;

  function onClick() {
    if (needsConfirm) {
      setError(null);
      // Frisches Haekchen bei jedem Oeffnen: einmal bestaetigt heisst nicht
      // fuer immer bestaetigt, die Namensliste kann sich geaendert haben.
      setAcked(false);
      setOpen(true);
      return;
    }
    run();
  }

  function run() {
    // Gurt und Hosentraeger — die Regel darf nicht nur am disabled haengen.
    if (skipped && !acked) return;

    setOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await generateBracket(tournamentId, {
        discardResults: lost !== null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-7 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "Generiere…"
          : regenerate
            ? "Neu generieren"
            : "Generieren"}
      </button>

      {/* Steht auch ohne Klick da: der Vorfall war, dass niemand die Luecke
          gesehen hat, und der Dialog zeigt sie erst nach dem Druecken. */}
      {skipped && (
        <div className="flex flex-col gap-1 rounded-lg border border-warn/30 bg-warn/[0.04] px-3 py-2">
          {skipped.map((line) => (
            <p key={line} className="text-xs leading-snug text-fg-muted">
              {line}
            </p>
          ))}
        </div>
      )}

      {regenerate &&
        (lost ? (
          <p className="text-xs text-live">
            Löscht das Bracket — {lost.label} {lost.plural ? "gehen" : "geht"}{" "}
            dabei verloren.
          </p>
        ) : (
          <p className="text-xs text-fg-dim">
            Ersetzt das bestehende Bracket und alle Matches.
          </p>
        ))}
      {error && <p className="text-sm text-live">{error}</p>}

      {/*
        Kontrolliertes `open` MIT `onOpenChange` — das ist hier richtig, weil
        Abbrechen und Escape erlaubt sein sollen. Der dokumentierte Fallstrick
        (ui/alert-dialog) ist die andere Kombination: `open` ohne
        `onOpenChange` macht Escape wirkungslos UND laesst den Unmount nie
        laufen. Wer den Handler hier entfernt, baut den Bug nach.
      */}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogPopup>
          <div className="flex flex-col gap-4">
            <AlertDialogTitle>
              {regenerate ? "Bracket neu generieren?" : "Bracket generieren?"}
            </AlertDialogTitle>

            <AlertDialogDescription>
              Der Spielplan entsteht aus den eingecheckten Teilnehmern in
              Seeding-Reihenfolge. Ein Turnier im Anmeldestatus wechselt danach
              auf „Läuft“.
            </AlertDialogDescription>

            {skipped && (
              <div className="flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn/[0.06] p-4">
                <p className="font-display text-[11px] uppercase tracking-[0.18em] text-warn">
                  Bleibt draußen
                </p>
                {skipped.map((line) => (
                  <p key={line} className="text-sm leading-snug text-fg-muted">
                    {line}
                  </p>
                ))}
              </div>
            )}

            {/* Getrennter Block, getrennte Farbe: „bekommt kein Match" und
                „wird geloescht" sind verschiedene Schaeden. */}
            {lost ? (
              <div className="flex flex-col gap-2 rounded-xl border border-live/40 bg-live/[0.06] p-4">
                <p className="font-display text-[11px] uppercase tracking-[0.18em] text-live">
                  Wird gelöscht
                </p>
                <p className="text-sm leading-snug text-fg-muted">
                  {lost.label} {lost.plural ? "werden" : "wird"} unwiderruflich
                  gelöscht. Das Bracket wird komplett neu ausgelost — alle
                  bisherigen Spielstände müssen danach neu eingetragen werden.
                </p>
              </div>
            ) : (
              regenerate && (
                <p className="text-sm leading-snug text-fg-muted">
                  Das bestehende Bracket wird ersetzt und alle Matches neu
                  generiert.
                </p>
              )
            )}

            {skipped && (
              <Label className="items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-4">
                {/* Kein aria-label: das umschliessende Label benennt die Box
                    schon, Base UI haengt sonst beides aneinander. */}
                <Checkbox
                  checked={acked}
                  onCheckedChange={(value) => setAcked(value)}
                />
                <span className="leading-snug text-fg-muted">
                  Trotzdem generieren — die genannten Spieler/Teams bleiben
                  draußen
                </span>
              </Label>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-4 py-2.5 font-display text-xs font-medium uppercase tracking-wider text-fg-muted transition-colors hover:border-white/20 hover:text-ink"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={run}
                disabled={skipped !== null && !acked}
                className="rounded-lg bg-lime px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regenerate ? "Neu generieren" : "Generieren"}
              </button>
            </div>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
