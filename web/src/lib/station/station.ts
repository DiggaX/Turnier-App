/** Minimal match shape the station needs to decide playability. */
export interface StationMatch {
  status: string;
  participantAId: string | null;
  participantBId: string | null;
}

/** A player-reported score for a match (both sides use the same orientation). */
export interface Report {
  scoreA: number;
  scoreB: number;
}

/** Playable = not yet decided (pending/live) with both opponents present. */
export function isPlayable(m: StationMatch): boolean {
  return (
    (m.status === "pending" || m.status === "live") &&
    m.participantAId !== null &&
    m.participantBId !== null
  );
}

/**
 * The agreed score to prefill the station's entry: returned only when every
 * report carries the same (scoreA, scoreB). Null when reports conflict or there
 * are none, so the referee must enter it.
 */
export function agreedScore(reports: Report[]): Report | null {
  if (reports.length === 0) return null;
  const first = reports[0];
  const allAgree = reports.every(
    (r) => r.scoreA === first.scoreA && r.scoreB === first.scoreB,
  );
  return allAgree ? { scoreA: first.scoreA, scoreB: first.scoreB } : null;
}
