import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { StatusBadge, type TournamentStatus } from "./status-badge";

export type TournamentCardProps = {
  /** Short uppercase tag for the game chip, e.g. "VL", "CS", "RL". */
  gameTag: string;
  /** Full game label shown above the title, e.g. "Valorant · 5v5". */
  game: string;
  /** Tournament title, e.g. "Next Level Masters". */
  title: string;
  /** Lifecycle status driving the pill colour. */
  status: TournamentStatus;
  /** Override the status pill label (defaults to the status' German label). */
  statusLabel?: string;
  /** Format + time line, e.g. "Single Elimination · heute 18:00". */
  meta: string;
  /** Prize pool, e.g. "$250K". Hidden when omitted. */
  prize?: string;
  /** Teams count, e.g. "16/16" or "—". */
  teams?: string;
  /**
   * Primary action slot — pass a <Link>, <Button>, or anchor. Kept as a slot so
   * the card stays presentational and owns no routing/click logic.
   */
  action?: ReactNode;
  /** Accent colour for the game chip glyph. */
  tagColor?: "lime" | "cyan" | "muted";
  /** Dim the whole card (used for upcoming/draft tournaments). */
  dim?: boolean;
  className?: string;
};

const TAG_COLOR: Record<NonNullable<TournamentCardProps["tagColor"]>, string> = {
  lime: "text-lime",
  cyan: "text-cyan",
  muted: "text-fg-muted",
};

/**
 * Presentational card for the public "Finde dein Turnier" list.
 * All interactivity (links/actions) is passed in via the `action` slot.
 */
export function TournamentCard({
  gameTag,
  game,
  title,
  status,
  statusLabel,
  meta,
  prize,
  teams,
  action,
  tagColor = "lime",
  dim = false,
  className,
}: TournamentCardProps) {
  return (
    <div
      data-slot="tournament-card"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5",
        "sm:grid sm:grid-cols-[64px_1fr_auto] sm:items-center sm:gap-5 sm:p-[18px_22px]",
        "md:grid-cols-[64px_1fr_auto_auto_auto] md:gap-[22px]",
        "transition-colors",
        dim && "opacity-[0.78]",
        className,
      )}
    >
      {/* game chip */}
      <div
        aria-hidden
        className={cn(
          "flex size-16 items-center justify-center rounded-xl font-display text-lg",
          "bg-[repeating-linear-gradient(135deg,#1a2230,#1a2230_8px,#141a24_8px,#141a24_16px)]",
          TAG_COLOR[tagColor],
        )}
      >
        {gameTag}
      </div>

      {/* title block */}
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-cyan">
            {game}
          </span>
          <StatusBadge status={status} label={statusLabel} />
        </div>
        <div className="truncate font-display text-xl font-semibold text-ink">
          {title}
        </div>
        <div className="mt-0.5 text-[13px] text-fg-muted">{meta}</div>
      </div>

      {/* prize */}
      {prize != null && (
        <div className="text-center">
          <div className="font-display text-lg font-bold text-lime">{prize}</div>
          <div className="font-display text-[10px] uppercase tracking-wider text-fg-dim">
            Prize
          </div>
        </div>
      )}

      {/* teams */}
      {teams != null && (
        <div className="text-center">
          <div className="font-display text-lg font-bold text-ink">{teams}</div>
          <div className="font-display text-[10px] uppercase tracking-wider text-fg-dim">
            Teams
          </div>
        </div>
      )}

      {/* action slot */}
      {action && (
        <div className="sm:col-span-full md:col-span-1 sm:justify-self-end">
          {action}
        </div>
      )}
    </div>
  );
}
