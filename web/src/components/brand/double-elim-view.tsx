import { MatchCard, type BracketMatch } from "@/components/brand/match-card";
import { cn } from "@/lib/utils";

/** A bracket match plus which sub-bracket it belongs to (winner/loser/GF). */
export type DoubleElimMatch = BracketMatch & {
  bracket: string;
};

export type DoubleElimViewProps = {
  matches: DoubleElimMatch[];
  className?: string;
};

/**
 * A labelled sub-bracket laid out as round columns.
 *
 * Not mirrored, unlike the single-elim view: a loser bracket is not a
 * symmetric tree — its rounds alternate between merging two loser-bracket
 * matches and absorbing a fresh drop-out from the winner bracket — so there is
 * no midpoint to fold it around. Compactness here comes from the shared card
 * and from scaling the whole view to fit, not from the shape.
 */
function BracketSection({
  label,
  matches,
}: {
  label: string;
  matches: DoubleElimMatch[];
}) {
  if (matches.length === 0) return null;

  const rounds = [...new Set(matches.map((m) => m.round))].sort(
    (a, b) => a - b,
  );

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        {label}
      </h3>
      <div className="flex gap-4">
        {rounds.map((round) => {
          const inRound = matches
            .filter((m) => m.round === round)
            .sort((a, b) => a.slot - b.slot);
          return (
            <div key={round} className="flex shrink-0 flex-col gap-2">
              <div className="font-display text-[10px] uppercase tracking-[0.16em] text-fg-muted">
                Runde {round}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {inRound.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Double-elimination bracket: Winner Bracket, Loser Bracket and Grand Final,
 * each a strip of round columns sharing the single-elim card. Presentational —
 * receives matches already joined with display names and tagged with their
 * sub-bracket. Wrap it in `FitToBox` on a fixed surface: the loser bracket runs
 * to ten columns at 64 entrants and is what used to fall off the projector.
 */
export function DoubleElimView({ matches, className }: DoubleElimViewProps) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-fg-muted">Noch keine Matches generiert.</p>
    );
  }

  const winner = matches.filter((m) => m.bracket === "winner");
  const loser = matches.filter((m) => m.bracket === "loser");
  const grandFinal = matches.filter((m) => m.bracket === "grand_final");

  return (
    <div
      className={cn("flex w-max flex-col gap-6", className)}
      data-testid="double-elim-view"
    >
      <BracketSection label="Winner Bracket" matches={winner} />
      <BracketSection label="Loser Bracket" matches={loser} />
      <BracketSection label="Grand Final" matches={grandFinal} />
    </div>
  );
}
