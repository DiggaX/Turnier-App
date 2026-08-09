import { cn } from "@/lib/utils";
import { getDisplayedScore, getMatchDisplayState } from "@/lib/live-match";

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
  scoreA?: number | null;
  scoreB?: number | null;
  liveScoreA?: number | null;
  liveScoreB?: number | null;
  liveEndedAt?: string | null;
};

/**
 * Which way a card reads. The mirrored half of a bracket runs outward from the
 * centre, so its scores sit on the outer edge too — otherwise the numbers of
 * the two halves face each other and the eye has to jump the middle.
 */
export type Side = "left" | "right";

/**
 * Card and connector widths in pixels, shared so the round-label header cannot
 * drift out of alignment with the tree it labels. Change here, not in a class.
 */
export const CARD_W = 168;
export const CONNECTOR_W = 16;

/** Side label for an empty slot: "Freilos" after a bye, otherwise "TBD". */
export function sideLabel(
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
  score,
  side,
}: {
  name: string | null;
  status: BracketMatch["status"];
  isWinner: boolean;
  score: number | null;
  side: Side;
}) {
  const empty = !name;
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5",
        side === "right" && "flex-row-reverse",
        isWinner && "bg-lime/[0.08]",
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-display text-[13px] font-semibold leading-tight",
          side === "right" && "text-right",
          isWinner ? "text-lime" : empty ? "text-fg-dim" : "text-ink",
        )}
      >
        {sideLabel(name, status)}
      </span>
      {score != null && (
        <span
          className={cn(
            "shrink-0 rounded-[4px] px-1.5 py-0.5 font-display text-[12px] font-bold tabular-nums",
            isWinner ? "bg-lime/20 text-lime" : "bg-white/[0.06] text-fg-muted",
          )}
        >
          {score}
        </span>
      )}
    </div>
  );
}

/**
 * One match — two rows, the winner picked out in lime, each side's score on its
 * own row. Used by every bracket shape so they stay one visual language.
 */
export function MatchCard({
  match,
  side = "left",
}: {
  match: BracketMatch;
  side?: Side;
}) {
  const aWin = match.winnerId != null && match.winnerId === match.participantAId;
  const bWin = match.winnerId != null && match.winnerId === match.participantBId;
  const displayState = getMatchDisplayState(match);
  const score = getDisplayedScore(match);

  return (
    <div
      style={{ width: CARD_W }}
      className={cn(
        "shrink-0 overflow-hidden rounded-[8px] border bg-surface",
        displayState === "live" ? "border-live/60" : "border-line",
      )}
    >
      {displayState === "live" && (
        <div className="bg-live/[0.12] py-0.5 text-center font-display text-[8px] uppercase tracking-[0.2em] text-live">
          Live
        </div>
      )}
      {displayState === "awaiting_confirmation" && (
        <div className="bg-cyan/[0.12] py-0.5 text-center font-display text-[8px] uppercase tracking-[0.14em] text-cyan">
          Freigabe
        </div>
      )}
      {match.status === "bye" && (
        <div className="bg-cyan/[0.12] py-0.5 text-center font-display text-[8px] uppercase tracking-[0.2em] text-cyan">
          Freilos
        </div>
      )}
      <Row
        name={match.aName}
        status={match.status}
        isWinner={aWin}
        score={score?.scoreA ?? null}
        side={side}
      />
      <div className="h-px bg-white/[0.06]" />
      <Row
        name={match.bName}
        status={match.status}
        isWinner={bWin}
        score={score?.scoreB ?? null}
        side={side}
      />
    </div>
  );
}
