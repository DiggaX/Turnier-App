import type {
  TournamentFormat,
  TournamentMode,
  TournamentStatus,
} from "@/lib/database.types";

/** Friendly German label for a tournament format enum value. */
const FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elim: "Single Elimination",
  double_elim: "Double Elimination",
  round_robin: "Round Robin",
  swiss: "Swiss",
  groups_playoffs: "Gruppen → Playoffs",
};

/** Friendly German label for a tournament status enum value. */
const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Bald",
  registration: "Anmeldung offen",
  running: "Läuft",
  finished: "Beendet",
};

/** Friendly German label for a tournament mode enum value. */
const MODE_LABELS: Record<TournamentMode, string> = {
  lan: "LAN",
  online: "Online",
  hybrid: "Hybrid",
};

/** Map a format enum to its German display label. Falls back to the raw value. */
export function formatLabel(format: TournamentFormat): string {
  return FORMAT_LABELS[format] ?? format;
}

/** Map a status enum to its German display label. Falls back to the raw value. */
export function statusLabel(status: TournamentStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Map a mode enum to its German display label. Falls back to the raw value. */
export function modeLabel(mode: TournamentMode): string {
  return MODE_LABELS[mode] ?? mode;
}
