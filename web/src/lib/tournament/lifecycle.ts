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

/**
 * Two-letter game chip tag, e.g. "Valorant" → "VL", "Counter-Strike 2" → "CS".
 * Used by both the org page and the tournament detail page.
 */
export function gameTag(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase() || "??";
}
