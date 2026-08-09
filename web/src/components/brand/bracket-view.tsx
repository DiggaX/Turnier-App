import {
  CARD_W,
  CONNECTOR_W,
  MatchCard,
  type BracketMatch,
  type Side,
} from "@/components/brand/match-card";
import { cn } from "@/lib/utils";

export type { BracketMatch };

export type BracketViewProps = {
  matches: BracketMatch[];
  className?: string;
};

/** German round label: the last round is "Finale", second-to-last "Halbfinale". */
export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round; // 0 = final
  if (fromEnd === 0) return "Finale";
  if (fromEnd === 1) return "Halbfinale";
  if (fromEnd === 2) return "Viertelfinale";
  return `Runde ${round}`;
}

/** The straight run from one match into the next — used either side of the final. */
function CentreLink() {
  return (
    <div
      style={{ width: CONNECTOR_W }}
      className="relative shrink-0 self-stretch"
    >
      <span className="absolute inset-x-0 top-1/2 border-t border-line" />
    </div>
  );
}

/**
 * The fork joining two child matches to their parent.
 *
 * Single-elim is padded to a power of two, so both children always carry the
 * same subtree depth and therefore the same height — which puts their centres
 * on the 25% and 75% marks of the children column, give or take a quarter of
 * the gap between them. That is what lets one absolutely positioned box draw
 * the whole fork without measuring anything. It would drift on an unbalanced
 * tree; this bracket never has one.
 */
function Connector({ side }: { side: Side }) {
  const left = side === "left";
  return (
    <div
      style={{ width: CONNECTOR_W }}
      className="relative shrink-0 self-stretch"
    >
      <span
        className={cn(
          "absolute top-1/4 h-1/2 w-1/2 border-y border-line",
          left ? "left-0 rounded-r-[4px] border-r" : "right-0 rounded-l-[4px] border-l",
        )}
      />
      <span
        className={cn(
          "absolute top-1/2 w-1/2 border-t border-line",
          left ? "left-1/2" : "right-1/2",
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
  const card = <MatchCard match={match} side={side} />;

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
 * Round names across the top, aligned to the tree below.
 *
 * The tree is nested, so there is no column element to hang a label on. The
 * alignment instead comes from the fact that every column is exactly one card
 * wide and every gap exactly one connector — the same two constants the cards
 * themselves use, so the two cannot drift apart.
 */
function RoundLabels({ totalRounds }: { totalRounds: number }) {
  const cell = (key: string, text: string) => (
    <div
      key={key}
      style={{ width: CARD_W }}
      className="shrink-0 text-center font-display text-[10px] uppercase tracking-[0.16em] text-fg-dim"
    >
      {text}
    </div>
  );
  const gap = (key: string) => (
    <div key={key} style={{ width: CONNECTOR_W }} className="shrink-0" />
  );

  const cells: React.ReactNode[] = [];
  // Left half, outermost round first.
  for (let r = 1; r <= totalRounds - 1; r++) {
    if (r > 1) cells.push(gap(`lg${r}`));
    cells.push(cell(`l${r}`, roundLabel(r, totalRounds)));
  }
  if (totalRounds > 1) cells.push(gap("cl"));
  cells.push(cell("final", "Finale"));
  if (totalRounds > 1) cells.push(gap("cr"));
  // Right half mirrors back out.
  for (let r = totalRounds - 1; r >= 1; r--) {
    cells.push(cell(`r${r}`, roundLabel(r, totalRounds)));
    if (r > 1) cells.push(gap(`rg${r}`));
  }

  return <div className="mb-2 flex items-end justify-center">{cells}</div>;
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

  if (!final) {
    return (
      <p className="text-sm text-fg-muted">Noch keine Matches generiert.</p>
    );
  }

  // Slot s of round r feeds floor(s/2) of r+1, so a match is fed by 2s and
  // 2s+1 of the round below.
  const childrenOf = (m: BracketMatch): BracketMatch[] =>
    [
      byKey.get(`${m.round - 1}-${m.slot * 2}`),
      byKey.get(`${m.round - 1}-${m.slot * 2 + 1}`),
    ].filter((x): x is BracketMatch => x != null);

  const [feedA, feedB] = childrenOf(final);

  return (
    <div className={cn("w-max", className)} data-testid="bracket-view">
      <RoundLabels totalRounds={finalRound} />
      <div className="flex items-center justify-center">
        {feedA && (
          <>
            <Subtree match={feedA} childrenOf={childrenOf} side="left" />
            <CentreLink />
          </>
        )}
        <MatchCard match={final} side="left" />
        {feedB && (
          <>
            <CentreLink />
            <Subtree match={feedB} childrenOf={childrenOf} side="right" />
          </>
        )}
      </div>
    </div>
  );
}
