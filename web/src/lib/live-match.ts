import type { MatchStatus } from "@/lib/database.types";

export type MatchDisplayState =
  | "pending"
  | "live"
  | "awaiting_confirmation"
  | "done"
  | "bye";

export interface LiveMatchInput {
  status: MatchStatus;
  scoreA?: number | null;
  scoreB?: number | null;
  liveScoreA?: number | null;
  liveScoreB?: number | null;
  liveEndedAt?: string | null;
}

export interface MatchScore {
  scoreA: number;
  scoreB: number;
}

function isScore(value: number | null | undefined): value is number {
  return value != null && Number.isInteger(value) && value >= 0;
}

/** Maps persisted match data to the one visual state used by every schedule. */
export function getMatchDisplayState(match: LiveMatchInput): MatchDisplayState {
  if (match.status === "done") return "done";
  if (match.status === "bye") return "bye";
  if (match.status === "live") {
    return match.liveEndedAt ? "awaiting_confirmation" : "live";
  }
  return "pending";
}

/** The score that is safe to show for the current visual state. */
export function getDisplayedScore(match: LiveMatchInput): MatchScore | null {
  const state = getMatchDisplayState(match);
  const [scoreA, scoreB] =
    state === "done"
      ? [match.scoreA, match.scoreB]
      : state === "live" || state === "awaiting_confirmation"
        ? [match.liveScoreA, match.liveScoreB]
        : [null, null];

  return isScore(scoreA) && isScore(scoreB) ? { scoreA, scoreB } : null;
}

export function hasValidScore(
  scoreA: number | null | undefined,
  scoreB: number | null | undefined,
): boolean {
  return isScore(scoreA) && isScore(scoreB);
}
