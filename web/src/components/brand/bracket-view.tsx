import { cn } from "@/lib/utils";

/** A match enriched with participant display names for rendering. */
export type BracketMatch = {
  id: string;
  round: number;
  slot: number;
  status: "pending" | "live" | "done" | "bye";
  aName: string | null;
  bName: string | null;
  winnerId: string | null;
  participantAId: string | null;
  participantBId: string | null;
};

export type BracketViewProps = {
  matches: BracketMatch[];
  className?: string;
};

/** German round label: the last round is "Finale", second-to-last "Halbfinale". */
function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round; // 0 = final
  if (fromEnd === 0) return "Finale";
  if (fromEnd === 1) return "Halbfinale";
  if (fromEnd === 2) return "Viertelfinale";
  return `Runde ${round}`;
}

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

/** One single-elimination match card — two named rows, winner highlighted lime. */
function Card({ match }: { match: BracketMatch }) {
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

/**
 * Single-elimination bracket — rounds laid out as columns, each match a dark
 * card. Empty sides render "TBD" (awaiting a winner) or "Freilos" (a bye), and
 * the winning participant is highlighted lime. Presentational: it receives
 * matches already joined with participant display names.
 */
export function BracketView({ matches, className }: BracketViewProps) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-fg-muted">Noch keine Matches generiert.</p>
    );
  }

  const rounds = [...new Set(matches.map((m) => m.round))].sort(
    (a, b) => a - b,
  );
  const totalRounds = rounds.length;

  return (
    <div
      className={cn("flex gap-4 overflow-x-auto pb-2 lg:gap-6", className)}
      data-testid="bracket-view"
    >
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
              {roundLabel(round, totalRounds)}
            </div>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {inRound.map((m) => (
                <Card key={m.id} match={m} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
