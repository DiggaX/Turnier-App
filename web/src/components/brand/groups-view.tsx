import { StandingsTable } from "@/components/brand/standings-table";
import type { BracketMatch } from "@/components/brand/bracket-view";
import type { StandingRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

/** A group-stage match enriched with scores. */
export type GroupMatch = BracketMatch & {
  groupNo: number | null;
  scoreA: number | null;
  scoreB: number | null;
};

export type GroupsViewProps = {
  matches: GroupMatch[];
  /** standings rows per group, indexed by group_no. */
  standingsByGroup: Record<number, StandingRow[]>;
  names: Record<string, string>;
  className?: string;
};

// groupCountFor never exceeds 25 groups, so index 0-25 → A-Z is safe.
const GROUP_LABEL = (n: number) => `Gruppe ${String.fromCharCode(65 + n)}`;

/**
 * Groups view: one section per group with its standings table and its
 * match schedule (decided matches show the score, winner in lime).
 * Presentational — receives matches joined with names + scores.
 */
export function GroupsView({
  matches,
  standingsByGroup,
  names,
  className,
}: GroupsViewProps) {
  const groupNos = [
    ...new Set(
      matches
        .map((m) => m.groupNo)
        .filter((g): g is number => g !== null),
    ),
  ].sort((a, b) => a - b);

  return (
    <div className={cn("flex flex-col gap-8", className)} data-testid="groups-view">
      {groupNos.map((gNo) => {
        const groupMatches = matches
          .filter((m) => m.groupNo === gNo)
          .sort((a, b) => a.round - b.round || a.slot - b.slot);
        return (
          <section key={gNo} className="flex flex-col gap-3">
            <div className="font-display text-xs uppercase tracking-[0.18em] text-cyan">
              {GROUP_LABEL(gNo)}
            </div>
            <StandingsTable
              rows={standingsByGroup[gNo] ?? []}
              names={names}
            />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {groupMatches.map((m, i) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    i > 0 && "border-t border-line/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex-1 truncate text-right font-display text-sm font-semibold",
                      m.winnerId && m.winnerId === m.participantAId
                        ? "text-lime"
                        : "text-ink",
                    )}
                  >
                    {m.aName ?? "TBD"}
                  </span>
                  <span className="font-display text-[11px] tabular-nums text-fg-dim">
                    {m.status === "done"
                      ? `${m.scoreA ?? "–"}:${m.scoreB ?? "–"}`
                      : "vs"}
                  </span>
                  <span
                    className={cn(
                      "flex-1 truncate font-display text-sm font-semibold",
                      m.winnerId && m.winnerId === m.participantBId
                        ? "text-lime"
                        : "text-ink",
                    )}
                  >
                    {m.bName ?? "TBD"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
