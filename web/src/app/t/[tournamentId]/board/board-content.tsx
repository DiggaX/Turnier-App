import { BracketView, type BracketMatch } from "@/components/brand/bracket-view";
import { DoubleElimView } from "@/components/brand/double-elim-view";
import { FitToBox } from "@/components/brand/fit-to-box";
import { GroupsView, type GroupMatch } from "@/components/brand/groups-view";
import { RoundRobinView } from "@/components/brand/round-robin-view";
import { StandingsTable } from "@/components/brand/standings-table";
import { SwissView } from "@/components/brand/swiss-view";
import { statusLabel } from "@/lib/labels";
import type {
  TournamentFormat,
  TournamentStatus,
} from "@/lib/database.types";
import type { StandingRow } from "@/lib/standings";
import { cn } from "@/lib/utils";
import { getDisplayedScore, getMatchDisplayState } from "@/lib/live-match";

/** A match enriched with names + scores for the board. */
export type BoardMatch = BracketMatch & {
  /** Which sub-bracket the match belongs to (winner/loser/grand_final). */
  bracket: string;
  scoreA: number | null;
  scoreB: number | null;
  groupNo?: number | null;
};

export type BoardContentProps = {
  name: string;
  gameName: string | null;
  status: TournamentStatus;
  format: TournamentFormat;
  matches: BoardMatch[];
  /** Map participant id → display name (for standings). */
  names: Record<string, string>;
  standings: StandingRow[];
  /** Per-group standings for groups_playoffs, indexed by group_no. */
  standingsByGroup?: Record<number, StandingRow[]>;
};

const SECTION_LABEL =
  "font-display text-xs uppercase tracking-[0.2em] text-fg-dim";

/**
 * How much screen the bracket gets on the board: everything below the header.
 * Measured, not guessed — on a 1080p projector the box starts at y=253 (board
 * top bar 49, page padding, title block, section label), so 270 leaves it a
 * little air at the bottom rather than a scrollbar.
 */
const BRACKET_BOX = "h-[calc(100vh-270px)] min-h-[420px] w-full";

/** Is this match playable right now? Both sides present and not yet decided. */
function isPlayable(m: BoardMatch): boolean {
  return m.aName != null && m.bName != null && m.status !== "done";
}

/** Is this match decided (has a confirmed final score)? */
function isDecided(m: BoardMatch): boolean {
  return m.status === "done" && m.scoreA != null && m.scoreB != null;
}

/** Score cell text for one side, or "—" when no score has been entered yet. */
function scoreText(score: number | null): string {
  return score == null ? "—" : String(score);
}

/**
 * One large "Jetzt spielbar" card: both names with the current score (live or
 * not-yet-started). Beamer-readable type.
 */
function PlayableCard({ match }: { match: BoardMatch }) {
  const displayState = getMatchDisplayState(match);
  const live = displayState === "live";
  const score = getDisplayedScore(match);
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border bg-bg/60 px-6 py-6",
        live ? "border-live/40" : displayState === "awaiting_confirmation" ? "border-cyan/40" : "border-line",
      )}
    >
      <div className="truncate text-right font-display text-2xl font-semibold text-ink sm:text-3xl">
        {match.aName}
      </div>
      <div className="font-display text-3xl font-bold tabular-nums sm:text-4xl">
        <span className="text-lime">{scoreText(score?.scoreA ?? null)}</span>
        <span className="px-2 text-fg-dim">:</span>
        <span className="text-ink">{scoreText(score?.scoreB ?? null)}</span>
      </div>
      <div className="truncate font-display text-2xl font-semibold text-fg-muted sm:text-3xl">
        {match.bName}
      </div>
      <div className="col-span-3 flex justify-center">
        {live ? (
          <span className="inline-flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.2em] text-live">
            <span
              aria-hidden
              className="inline-block size-1.5 animate-pulse rounded-full bg-live"
            />
            Live
          </span>
        ) : displayState === "awaiting_confirmation" ? (
          <span className="font-display text-[11px] uppercase tracking-[0.16em] text-cyan">
            Wartet auf Freigabe
          </span>
        ) : (
          <span className="font-display text-[11px] uppercase tracking-[0.2em] text-fg-dim">
            Bereit
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * One decided-match card: final score with the winner highlighted lime.
 * Beamer-readable so confirmed results are legible from the room.
 */
function ResultCard({ match }: { match: BoardMatch }) {
  const aWin = match.winnerId != null && match.winnerId === match.participantAId;
  const bWin = match.winnerId != null && match.winnerId === match.participantBId;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-2xl border border-line bg-bg/40 px-6 py-5">
      <div
        className={cn(
          "truncate text-right font-display text-xl font-semibold sm:text-2xl",
          aWin ? "text-lime" : "text-fg-muted",
        )}
      >
        {match.aName ?? "—"}
      </div>
      <div
        data-testid="result-score"
        aria-label={`${match.scoreA}:${match.scoreB}`}
        className="font-display text-2xl font-bold tabular-nums sm:text-3xl"
      >
        <span className={aWin ? "text-lime" : "text-ink"}>{match.scoreA}</span>
        <span className="px-2 text-fg-dim">:</span>
        <span className={bWin ? "text-lime" : "text-ink"}>{match.scoreB}</span>
      </div>
      <div
        className={cn(
          "truncate font-display text-xl font-semibold sm:text-2xl",
          bWin ? "text-lime" : "text-fg-muted",
        )}
      >
        {match.bName ?? "—"}
      </div>
    </div>
  );
}

/**
 * Public live board (beamer view): dark esports styling with large readable
 * type. Header (name + game + status), a "Jetzt spielbar" section of open
 * matches, then the full bracket (single-elim) or standings + schedule
 * (round-robin). Done matches surface their final score + winner via the shared
 * brand views. Presentational only — data is loaded by the server page.
 */
export function BoardContent({
  name,
  gameName,
  status,
  format,
  matches,
  names,
  standings,
  standingsByGroup = {},
}: BoardContentProps) {
  const isSwiss = format === "swiss";
  const isRoundRobin = format === "round_robin";
  const isDoubleElim = format === "double_elim";
  const isGroupsPlayoffs = format === "groups_playoffs";

  const liveMatches = matches.filter((m) => m.status === "live");
  const playable =
    liveMatches.length > 0 ? liveMatches : matches.filter(isPlayable);
  const decided = matches.filter(isDecided);

  return (
    // max-w-[1600px] rather than 1280: this is the beamer view, and a 1080p
    // projector was leaving 600px of its width unused.
    <div className="mx-auto max-w-[1600px] px-6 pb-20 pt-8 sm:px-10">
      {/* header */}
      <header className="mb-10">
        <div className="mb-2 font-display text-xs uppercase tracking-[0.22em] text-cyan">
          Live-Board · Beamer-Ansicht
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-bold uppercase leading-[0.98] tracking-tight text-ink sm:text-6xl">
            {name}
          </h1>
          <div className="flex items-center gap-3">
            {gameName && (
              <span className="font-display text-sm uppercase tracking-[0.14em] text-cyan">
                {gameName}
              </span>
            )}
            <span
              data-status={status}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-display text-xs font-medium uppercase tracking-[0.14em]",
                status === "running"
                  ? "bg-live/15 text-live shadow-[0_0_26px_rgba(255,59,92,0.22)]"
                  : status === "registration"
                    ? "bg-lime/15 text-lime"
                    : "bg-white/[0.08] text-fg-muted",
              )}
            >
              {status === "running" && (
                <span
                  aria-hidden
                  className="inline-block size-1.5 rounded-full bg-current"
                />
              )}
              {statusLabel(status)}
            </span>
          </div>
        </div>
      </header>

      {/* The bracket comes first on purpose. This is the projector view, and
          with sixteen entrants the ready-to-play list ran to 570px, which
          pushed the tree off the bottom of a 1080p screen — where nobody can
          scroll it back. Standings + schedule (round-robin / swiss), WB/LB/GF
          (double-elim), or the single bracket (single-elim). */}
      {isGroupsPlayoffs ? (
        <div className="flex flex-col gap-8">
          <GroupsView
            matches={
              matches.filter(
                (m) => m.groupNo != null,
              ) as GroupMatch[]
            }
            standingsByGroup={standingsByGroup}
            names={names}
          />
          {matches.some((m) => m.groupNo == null) && (
            <section className="flex flex-col gap-3 border-t border-line pt-6">
              <div className={cn(SECTION_LABEL, "mb-2")}>Playoffs</div>
              <FitToBox maxScale={1.4} className="h-[55vh] w-full">
                <BracketView
                  matches={matches.filter((m) => m.groupNo == null)}
                />
              </FitToBox>
            </section>
          )}
        </div>
      ) : isSwiss ? (
        <section>
          <div className={cn(SECTION_LABEL, "mb-4")}>Swiss</div>
          <SwissView matches={matches} standings={standings} names={names} />
        </section>
      ) : isRoundRobin ? (
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <section>
            <div className={cn(SECTION_LABEL, "mb-4")}>Tabelle</div>
            <StandingsTable rows={standings} names={names} />
          </section>
          <section>
            <div className={cn(SECTION_LABEL, "mb-4")}>Spielplan</div>
            <RoundRobinView matches={matches} />
          </section>
        </div>
      ) : isDoubleElim ? (
        <section>
          <div className={cn(SECTION_LABEL, "mb-4")}>Turnierbaum</div>
          {/* One box around all three sub-brackets, so they scale together and
              stay the same size relative to each other. */}
          <FitToBox maxScale={1.4} className={BRACKET_BOX}>
            <DoubleElimView matches={matches} />
          </FitToBox>
        </section>
      ) : (
        <section>
          <div className={cn(SECTION_LABEL, "mb-4")}>Turnierbaum</div>
          {/* Fixed box, because nobody scrolls a projector: the bracket is
              scaled to whatever fits instead of running off the edge. The
              height is what is left of the screen under the header. */}
          <FitToBox maxScale={1.6} className={BRACKET_BOX}>
            <BracketView matches={matches} />
          </FitToBox>
        </section>
      )}

      {/* Below the fold on a projector, and deliberately so — these are for
          anyone reading the board on a phone or laptop. */}
      <section className="mt-12">
        <div className={cn(SECTION_LABEL, "mb-4")}>
          {liveMatches.length > 0 ? "Laeuft jetzt" : "Bereit zum Start"}
        </div>
        {playable.length === 0 ? (
          <p className="rounded-2xl border border-line bg-bg/40 px-6 py-8 text-center font-display text-lg text-fg-muted">
            Noch kein Match gestartet
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {playable.map((m) => (
              <PlayableCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="mt-12">
          <div className={cn(SECTION_LABEL, "mb-4")}>Ergebnisse</div>
          <div className="grid gap-4 lg:grid-cols-2">
            {decided.map((m) => (
              <ResultCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
