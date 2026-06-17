import { StandingsTable } from "@/components/brand/standings-table";
import type { BracketMatch } from "@/components/brand/bracket-view";
import type { StandingRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

/** A Swiss match enriched with scores (round-by-round schedule). */
export type SwissMatch = BracketMatch & {
  scoreA: number | null;
  scoreB: number | null;
};

export type SwissViewProps = {
  matches: SwissMatch[];
  standings: StandingRow[];
  names: Record<string, string>;
  className?: string;
};

/**
 * Swiss view: live standings table + the schedule grouped by round. Decided
 * matches show their score with the winner highlighted; byes are labelled.
 * Presentational — receives matches already joined with display names + scores.
 */
export function SwissView({
  matches,
  standings,
  names,
  className,
}: SwissViewProps) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div
      className={cn("grid gap-8 lg:grid-cols-[1fr_1.1fr]", className)}
      data-testid="swiss-view"
    >
      <section className="flex flex-col gap-3">
        <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-muted">
          Tabelle
        </div>
        <StandingsTable rows={standings} names={names} />
      </section>

      <section className="flex flex-col gap-5">
        <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-muted">
          Runden
        </div>
        {rounds.map((r) => {
          const round = matches
            .filter((m) => m.round === r)
            .sort((a, b) => a.slot - b.slot);
          return (
            <div key={r} className="flex flex-col gap-2.5">
              <div className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-dim">
                Runde {r}
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {round.map((m, i) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      i > 0 && "border-t border-line/60",
                    )}
                  >
                    {m.status === "bye" ? (
                      <span className="flex-1 truncate font-display text-sm font-semibold text-ink">
                        {m.aName ?? "TBD"}{" "}
                        <span className="text-fg-dim">· Freilos</span>
                      </span>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
