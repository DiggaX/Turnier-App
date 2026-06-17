import { cn } from "@/lib/utils";

import type { BracketMatch } from "@/components/brand/bracket-view";

export type RoundRobinViewProps = {
  matches: BracketMatch[];
  className?: string;
};

/**
 * Round-robin schedule — matches grouped by matchday (`round`), each pairing
 * shown as "A vs B". Presentational: receives matches already joined with
 * participant display names.
 */
export function RoundRobinView({ matches, className }: RoundRobinViewProps) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-fg-muted">Noch keine Spiele generiert.</p>
    );
  }

  const matchdays = [...new Set(matches.map((m) => m.round))].sort(
    (a, b) => a - b,
  );

  return (
    <div
      className={cn("flex flex-col gap-5", className)}
      data-testid="round-robin-view"
    >
      {matchdays.map((day) => {
        const pairings = matches
          .filter((m) => m.round === day)
          .sort((a, b) => a.slot - b.slot);
        return (
          <section key={day} className="flex flex-col gap-2.5">
            <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-muted">
              Spieltag {day}
            </div>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {pairings.map((m, i) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    i > 0 && "border-t border-line/60",
                  )}
                >
                  <span className="flex-1 truncate text-right font-display text-sm font-semibold text-ink">
                    {m.aName ?? "TBD"}
                  </span>
                  <span className="font-display text-[11px] uppercase tracking-[0.12em] text-fg-dim">
                    vs
                  </span>
                  <span className="flex-1 truncate font-display text-sm font-semibold text-ink">
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
