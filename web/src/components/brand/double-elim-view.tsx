import type { BracketMatch } from "@/components/brand/bracket-view";
import { cn } from "@/lib/utils";

/** A bracket match plus which sub-bracket it belongs to (winner/loser/GF). */
export type DoubleElimMatch = BracketMatch & {
  bracket: string;
};

export type DoubleElimViewProps = {
  matches: DoubleElimMatch[];
  className?: string;
};

/** Side label for an empty slot: "Freilos" after a bye, otherwise "TBD". */
function sideLabel(
  name: string | null,
  status: BracketMatch["status"],
): string {
  if (name) return name;
  return status === "bye" ? "Freilos" : "TBD";
}

function Row({
  name,
  status,
  isWinner,
}: {
  name: string | null;
  status: BracketMatch["status"];
  isWinner: boolean;
}) {
  const empty = !name;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5",
        isWinner && "bg-lime/[0.06]",
      )}
    >
      <span
        className={cn(
          "truncate font-display text-sm font-semibold",
          isWinner ? "text-lime" : empty ? "text-fg-dim" : "text-ink",
        )}
      >
        {sideLabel(name, status)}
      </span>
    </div>
  );
}

/** One match card — two named rows, winner highlighted lime. Mirrors BracketView. */
function MatchCard({ match }: { match: DoubleElimMatch }) {
  const aWin = match.winnerId != null && match.winnerId === match.participantAId;
  const bWin = match.winnerId != null && match.winnerId === match.participantBId;

  return (
    <div className="w-full overflow-hidden rounded-[10px] border border-line bg-surface">
      {match.status === "bye" && (
        <div className="bg-cyan/[0.1] py-1 text-center font-display text-[9px] uppercase tracking-[0.2em] text-cyan">
          Freilos
        </div>
      )}
      <Row name={match.aName} status={match.status} isWinner={aWin} />
      <div className="h-px bg-white/[0.06]" />
      <Row name={match.bName} status={match.status} isWinner={bWin} />
    </div>
  );
}

/** A labelled section (Winner / Loser / Grand Final) laid out as round columns. */
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
    <section className="flex flex-col gap-3">
      <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
        {label}
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-2 lg:gap-6">
        {rounds.map((round) => {
          const inRound = matches
            .filter((m) => m.round === round)
            .sort((a, b) => a.slot - b.slot);
          return (
            <div
              key={round}
              className="flex min-w-[200px] flex-1 flex-col gap-3 sm:min-w-[220px]"
            >
              <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-muted">
                Runde {round}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-3">
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
 * Double-elimination bracket view: three labelled sections — Winner Bracket,
 * Loser Bracket, Grand Final — each laid out as round columns of match cards,
 * reusing the single-elim card visual. Matches are grouped by `bracket` then by
 * `round`. Presentational: receives matches already joined with participant
 * display names and tagged with their sub-bracket.
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
      className={cn("flex flex-col gap-8", className)}
      data-testid="double-elim-view"
    >
      <BracketSection label="Winner Bracket" matches={winner} />
      <BracketSection label="Loser Bracket" matches={loser} />
      <BracketSection label="Grand Final" matches={grandFinal} />
    </div>
  );
}
