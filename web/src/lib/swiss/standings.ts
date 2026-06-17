import {
  computeStandings,
  type DoneMatch,
  type StandingRow,
} from "@/lib/standings";

/**
 * Swiss standings: head-to-head tallies from `computeStandings`, plus byes
 * (each bye is +1 win and +1 played with no score change). Players appearing
 * only via a bye are included. Sorted wins desc, diff desc, scoreFor desc, then
 * participantId asc as a deterministic final tiebreak (so the ranked order fed
 * to pairing is stable across calls).
 *
 * @param byeIds - one entry per bye awarded; no deduplication is applied.
 */
export function swissStandings(
  done: DoneMatch[],
  byeIds: string[],
): StandingRow[] {
  const base = computeStandings(done);
  const byId = new Map<string, StandingRow>(
    base.map((r) => [r.participantId, { ...r }]),
  );
  const order: string[] = base.map((r) => r.participantId);

  for (const id of byeIds) {
    let row = byId.get(id);
    if (!row) {
      row = {
        participantId: id,
        played: 0,
        wins: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        diff: 0,
      };
      byId.set(id, row);
      order.push(id);
    }
    row.wins += 1;
    row.played += 1;
  }

  const rows = order.map((id) => byId.get(id)!);
  rows.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.diff !== x.diff) return y.diff - x.diff;
    if (y.scoreFor !== x.scoreFor) return y.scoreFor - x.scoreFor;
    return x.participantId < y.participantId
      ? -1
      : x.participantId > y.participantId
        ? 1
        : 0;
  });
  return rows;
}
