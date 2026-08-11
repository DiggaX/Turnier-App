import { hasValidScore } from "@/lib/live-match";
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
export interface FinishedLiveScore {
  liveScoreA: number | null;
  liveScoreB: number | null;
  liveEndedAt: string | null;
}

export interface ScorePrefill {
  scoreA: number;
  scoreB: number;
  source: "player_reports" | "scorekeeper";
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
 *
 * `match_reports.reported_by` is the COMPETITOR (a team's team row, a solo
 * starter's own row) and unique per (match, reported_by), and report_match only
 * accepts a reporter that resolves to participant_a_id or participant_b_id —
 * so a match carries at most two reports, one per side. "All reports agree"
 * therefore still means "both sides reported the same".
 */
export function agreedScore(reports: Report[]): Report | null {
  if (reports.length < 2) return null;
  const first = reports[0];
  const allAgree = reports.every(
    (r) => r.scoreA === first.scoreA && r.scoreB === first.scoreB,
  );
  return allAgree ? { scoreA: first.scoreA, scoreB: first.scoreB } : null;
}
/**
 * Prefill priority for the referee: player agreement wins. A finished
 * scorekeeper score is otherwise a proposal, including after a player dispute.
 */
export function scorePrefill(
  reports: Report[],
  live: FinishedLiveScore,
): ScorePrefill | null {
  const agreed = agreedScore(reports);
  if (agreed) return { ...agreed, source: "player_reports" };

  if (
    live.liveEndedAt !== null &&
    hasValidScore(live.liveScoreA, live.liveScoreB)
  ) {
    return {
      scoreA: live.liveScoreA!,
      scoreB: live.liveScoreB!,
      source: "scorekeeper",
    };
  }

  return null;
}

/** One match as the bulk release sees it. */
export interface ConfirmCandidate extends StationMatch {
  id: string;
  aName: string | null;
  bName: string | null;
  reports: Report[];
}

/** A match ready for one-click release. */
export interface ConfirmItem {
  id: string;
  /** "A vs B" — so a failure can be reported by name. */
  label: string;
  scoreA: number;
  scoreB: number;
}

export interface ConfirmFailure {
  id: string;
  label: string;
  reason: string;
}

/**
 * The matches the referee can release in one go: still open, both slots filled,
 * both sides reported — and they agree. A disagreement stays a single decision,
 * and a draw is excluded because confirm_match rejects it.
 */
export function bulkConfirmable(matches: ConfirmCandidate[]): ConfirmItem[] {
  const items: ConfirmItem[] = [];
  for (const m of matches) {
    if (!isPlayable(m)) continue;
    const agreed = agreedScore(m.reports);
    if (!agreed || agreed.scoreA === agreed.scoreB) continue;
    items.push({
      id: m.id,
      label: `${m.aName ?? "TBD"} vs ${m.bName ?? "TBD"}`,
      scoreA: agreed.scoreA,
      scoreB: agreed.scoreB,
    });
  }
  return items;
}

/** Map a confirm_match failure to a German reason that names the cause. */
export function confirmFailureReason(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const lower = message.toLowerCase();
  if (lower.includes("draw")) return "Unentschieden ist nicht erlaubt.";
  if (lower.includes("loser-bracket"))
    return "Folgepartie im Loser-Bracket ist schon freigegeben — dort zuerst korrigieren.";
  if (lower.includes("bereits entschieden"))
    return "Folgepartie ist schon freigegeben — dort zuerst korrigieren.";
  if (lower.includes("staff") || lower.includes("organization"))
    return "Diese Aktion ist nur für die Orga erlaubt.";
  if (lower.includes("empty slot")) return "Das Match hat noch keinen Gegner.";
  if (lower.includes("invalid score"))
    return "Ungültiger Score. Bitte prüfe deine Eingabe.";
  return "Ergebnis konnte nicht freigegeben werden.";
}

/**
 * Release the matches one after another (confirm_match is single-match, there is
 * no bulk RPC). A failure is collected and the run continues — one stubborn
 * match must not swallow the rest.
 */
export async function confirmSequentially(
  items: ConfirmItem[],
  confirm: (item: ConfirmItem) => Promise<void>,
  onProgress?: (done: number) => void,
): Promise<ConfirmFailure[]> {
  const failures: ConfirmFailure[] = [];
  let done = 0;
  for (const item of items) {
    try {
      await confirm(item);
    } catch (e) {
      failures.push({
        id: item.id,
        label: item.label,
        reason: confirmFailureReason(e),
      });
    }
    onProgress?.(++done);
  }
  return failures;
}
