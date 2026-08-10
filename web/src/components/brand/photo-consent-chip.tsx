import { cn } from "@/lib/utils";

export type PhotoConsentChipProps = {
  granted: boolean;
  className?: string;
};

/**
 * Liegt für diesen Teilnehmer eine Fotoerlaubnis vor?
 *
 * Blau (cyan) heißt erteilt — das ist die Farbe, nach der am Check-in-Tresen
 * gesucht wird. Fehlt sie, ist das kein Fehler, sondern der zweite normale Fall:
 * darum grau und nicht rot. Geometrie wie StatusBadge, damit die Pillen im
 * Organizer-Bereich gleich aussehen.
 */
export function PhotoConsentChip({ granted, className }: PhotoConsentChipProps) {
  return (
    <span
      data-granted={granted}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] whitespace-nowrap",
        granted ? "bg-cyan/15 text-cyan" : "bg-white/[0.08] text-fg-dim",
        className,
      )}
    >
      {granted ? "Foto erlaubt" : "Keine Fotos"}
    </span>
  );
}
