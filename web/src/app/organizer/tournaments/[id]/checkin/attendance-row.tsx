"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { PhotoConsentChip } from "@/components/brand/photo-consent-chip";
import { formatShortDateTime } from "@/lib/format-date";

import { manualCheckIn, resetCheckIn } from "../participants/actions";

export function AttendanceRow({
  participantId,
  tournamentId,
  displayName,
  checkedInAt,
  photoConsent,
  showConsent = true,
}: {
  participantId: string;
  tournamentId: string;
  displayName: string;
  checkedInAt: string | null;
  photoConsent: boolean;
  /** Aus fuer Team-Zeilen: eine Fotoerlaubnis gehoert einem Menschen, und ein
   *  „Keine Fotoerlaubnis"-Chip an einem Team behauptete das Gegenteil. */
  showConsent?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reset() {
    if (!window.confirm(`Anwesenheit von „${displayName}" zurücksetzen?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await resetCheckIn(participantId, tournamentId);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  // No confirm dialog here: an accidental check-in is undone with „Zurücksetzen".
  function checkIn() {
    setError(null);
    startTransition(async () => {
      const res = await manualCheckIn(participantId, tournamentId);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <TableRow className="border-line/60 hover:bg-white/[0.02]">
      <TableCell className="font-display font-semibold text-ink">
        {displayName}
      </TableCell>
      <TableCell>
        {checkedInAt ? (
          // Blau, wenn eine Fotoerlaubnis vorliegt — dieselbe Farbe wie auf der
          // Scan-Karte, damit die Liste und der Tresen dasselbe sagen.
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] ${
              photoConsent ? "bg-cyan/15 text-cyan" : "bg-lime/15 text-lime"
            }`}
          >
            Anwesend
          </span>
        ) : (
          <span className="text-fg-dim">—</span>
        )}
        {showConsent && (
          <PhotoConsentChip granted={photoConsent} className="ml-2" />
        )}
        {checkedInAt && (
          <span className="ml-2 text-xs text-fg-muted">
            {formatShortDateTime(checkedInAt)}
          </span>
        )}
        {error && <p className="mt-1 text-xs text-live">{error}</p>}
      </TableCell>
      <TableCell className="text-right">
        {checkedInAt ? (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-[8px] border border-line px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            Zurücksetzen
          </button>
        ) : (
          <button
            type="button"
            onClick={checkIn}
            disabled={pending}
            className="rounded-[8px] border border-lime/40 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-lime transition-colors hover:bg-lime/10 hover:text-lime disabled:opacity-50"
          >
            Einchecken
          </button>
        )}
      </TableCell>
    </TableRow>
  );
}
