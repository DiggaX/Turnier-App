import { cn } from "@/lib/utils";

export type MatchTeam = {
  name: string;
  tag: string;
  /** Tailwind gradient classes for the team chip, e.g. "from-lime to-[#7da80f]". */
  chip: string;
  seed: number;
  score: number;
};

export type MatchCardProps = {
  a: MatchTeam;
  b: MatchTeam;
  /** Which side won ("a" | "b"), or undefined for an in-progress match. */
  win?: "a" | "b";
  /** Render with the live-red glow treatment (a match still in progress). */
  live?: boolean;
};

function Row({
  team,
  highlighted,
  won,
  live,
}: {
  team: MatchTeam;
  highlighted: boolean;
  won: boolean;
  live: boolean;
}) {
  const scoreColor = won
    ? "text-lime"
    : live && highlighted
      ? "text-live"
      : "text-fg-dim";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5",
        won && "bg-lime/[0.06]",
      )}
    >
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br font-display text-[11px] font-bold text-bg",
          team.chip,
        )}
      >
        {team.tag}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={cn(
            "truncate font-display text-sm font-semibold",
            highlighted ? "text-ink" : "text-fg-muted",
          )}
        >
          {team.name}
        </span>
        <span className="text-[10px] text-fg-dim">#{team.seed}</span>
      </div>
      <span className={cn("font-display text-[17px] font-bold", scoreColor)}>
        {team.score}
      </span>
    </div>
  );
}

/**
 * Single bracket match card — two team rows with seeds and scores. Mirrors the
 * design's match-card visual. The winning side is highlighted lime; a `live`
 * match gets a red glow with the leading side tinted red.
 */
export function MatchCard({ a, b, win, live = false }: MatchCardProps) {
  const aWin = win === "a";
  const bWin = win === "b";
  const aHi = aWin || (live && a.score >= b.score);
  const bHi = bWin || (live && b.score > a.score);

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-[10px] bg-surface",
        live
          ? "border border-live/45 shadow-[0_0_26px_rgba(255,59,92,0.22)]"
          : "border border-line",
      )}
    >
      {live && (
        <div className="flex items-center justify-center gap-1.5 bg-live/[0.12] py-1 font-display text-[9px] tracking-[0.2em] text-live">
          ● LIVE
        </div>
      )}
      <Row team={a} highlighted={aHi} won={aWin} live={live} />
      <div className="h-px bg-white/[0.06]" />
      <Row team={b} highlighted={bHi} won={bWin} live={live} />
    </div>
  );
}
