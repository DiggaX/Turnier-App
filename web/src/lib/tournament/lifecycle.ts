import type { TournamentStatus } from "@/lib/database.types";

/** The single guided next status, or null when there's no guided forward step. */
export function nextStatus(current: TournamentStatus): TournamentStatus | null {
  if (current === "draft") return "registration";
  if (current === "running") return "finished";
  // registration -> running happens via bracket generation, not a status button.
  return null;
}

/** Game/format may only change while the bracket has not been generated yet. */
export function canEditStructure(
  _status: TournamentStatus,
  hasMatches: boolean,
): boolean {
  return !hasMatches;
}

/** Display label for a team size: "Solo" for 1, otherwise "NvN". */
export function teamLabel(teamSize: number): string {
  return teamSize > 1 ? `${teamSize}v${teamSize}` : "Solo";
}
