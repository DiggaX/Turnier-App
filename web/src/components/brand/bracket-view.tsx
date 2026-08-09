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

export type BracketViewProps = {
  matches: BracketMatch[];
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

type Side = "left" | "right";

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
        // The mirrored half reads outward from the centre, so its score sits on
        // the outer edge too — otherwise the numbers of the two halves would
        // face each other and the eye has to jump.
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

/** One match — two rows, the winner picked out in lime, score per row. */
function Card({ match, side }: { match: BracketMatch; side: Side }) {
  const aWin = match.winnerId != null && match.winnerId === match.participantAId;
  const bWin = match.winnerId != null && match.winnerId === match.participantBId;
  const displayState = getMatchDisplayState(match);
  const score = getDisplayedScore(match);

  return (
    <div
      className={cn(
        "w-[168px] shrink-0 overflow-hidden rounded-[8px] border bg-surface",
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

const CONNECTOR_W = "w-4";

/** The straight run from one match into the next — used either side of the final. */
function CentreLink() {
  return (
    <div className={cn("relative shrink-0 self-stretch", CONNECTOR_W)}>
      <span className="absolute inset-x-0 top-1/2 border-t border-line" />
    </div>
  );
}

/**
 * The fork joining two child matches to their parent.
 *
 * Single-elim is padded to a power of two, so both children always carry the
 * same subtree depth and therefore the same height — which puts their centres
 * at the 25% and 75% marks of the children column, give or take a quarter of
 * the gap between them. That is what lets one absolutely positioned box draw
 * the whole fork without measuring anything. It would drift on an unbalanced
 * tree; this bracket never has one.
 */
function Connector({ side }: { side: Side }) {
  const outward = side === "left" ? "border-r" : "border-l";
  const round = side === "left" ? "rounded-r-[4px]" : "rounded-l-[4px]";
  return (
    <div className={cn("relative shrink-0 self-stretch", CONNECTOR_W)}>
      <span
        className={cn(
          "absolute top-1/4 h-1/2 w-1/2 border-y border-line",
          outward,
          round,
          side === "left" ? "left-0" : "right-0",
        )}
      />
      <span
        className={cn(
          "absolute top-1/2 w-1/2 border-t border-line",
          side === "left" ? "left-1/2" : "right-1/2",
        )}
      />
    </div>
  );
}

/** A match plus everything that feeds into it, growing away from the centre. */
function Subtree({
  match,
  childrenOf,
  side,
}: {
  match: BracketMatch;
  childrenOf: (m: BracketMatch) => BracketMatch[];
  side: Side;
}) {
  const kids = childrenOf(match);
  const card = <Card match={match} side={side} />;

  if (kids.length === 0) return card;

  const feeders = (
    <div className="flex flex-col justify-center gap-2">
      {kids.map((k) => (
        <Subtree key={k.id} match={k} childrenOf={childrenOf} side={side} />
      ))}
    </div>
  );

  return (
    <div className="flex items-center">
      {side === "left" ? (
        <>
          {feeders}
          <Connector side={side} />
          {card}
        </>
      ) : (
        <>
          {card}
          <Connector side={side} />
          {feeders}
        </>
      )}
    </div>
  );
}

/**
 * Single-elimination bracket, mirrored around the final.
 *
 * Laying every round out left-to-right makes a tall, narrow tree: 64 entrants
 * is 6 columns against 32 rows. Folding it around the final trades that height
 * for width, which is the shape a 16:9 screen actually wants — the same tree
 * becomes 11 columns against 16 rows, and survives being scaled to fit at a
 * readable size instead of a tenth of one.
 *
 * Presentational: it receives matches already joined with display names. Wrap
 * it in `FitToBox` where the surface is fixed, such as the beamer board.
 */
export function BracketView({ matches, className }: BracketViewProps) {
  if (matches.length === 0) {
    return (
      <p className="text-sm text-fg-muted">Noch keine Matches generiert.</p>
    );
  }

  const byKey = new Map(matches.map((m) => [`${m.round}-${m.slot}`, m]));
  const finalRound = Math.max(...matches.map((m) => m.round));
  const final = byKey.get(`${finalRound}-0`);

  // Slot s of round r feeds floor(s/2) of r+1, so a match is fed by 2s and
  // 2s+1 of the round below.
  const childrenOf = (m: BracketMatch): BracketMatch[] =>
    [
      byKey.get(`${m.round - 1}-${m.slot * 2}`),
      byKey.get(`${m.round - 1}-${m.slot * 2 + 1}`),
    ].filter((x): x is BracketMatch => x != null);

  // A two-entrant tournament is only a final; nothing to mirror.
  if (!final) {
    return (
      <p className="text-sm text-fg-muted">Noch keine Matches generiert.</p>
    );
  }

  const [feedA, feedB] = childrenOf(final);

  return (
    <div
      className={cn("flex items-center justify-center", className)}
      data-testid="bracket-view"
    >
      {feedA && (
        <>
          <Subtree match={feedA} childrenOf={childrenOf} side="left" />
          <CentreLink />
        </>
      )}
      <Card match={final} side="left" />
      {feedB && (
        <>
          <CentreLink />
          <Subtree match={feedB} childrenOf={childrenOf} side="right" />
        </>
      )}
    </div>
  );
}
