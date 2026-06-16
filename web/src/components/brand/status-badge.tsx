import { cn } from "@/lib/utils";

/** Lifecycle status of a tournament. */
export type TournamentStatus =
  | "draft"
  | "registration"
  | "running"
  | "finished";

type StatusConfig = {
  /** Uppercase German label shown in the pill. */
  label: string;
  /** Tailwind classes for the pill (bg + text + optional glow). */
  className: string;
  /** Whether to render the leading ● live dot. */
  dot: boolean;
};

const STATUS_CONFIG: Record<TournamentStatus, StatusConfig> = {
  running: {
    label: "Läuft",
    dot: true,
    className:
      "bg-live/15 text-live shadow-[0_0_26px_rgba(255,59,92,0.22)]",
  },
  registration: {
    label: "Anmeldung offen",
    dot: false,
    className: "bg-lime/15 text-lime",
  },
  draft: {
    label: "Bald",
    dot: false,
    className: "bg-white/[0.08] text-fg-muted",
  },
  finished: {
    label: "Beendet",
    dot: false,
    className: "bg-white/[0.08] text-fg-dim",
  },
};

export type StatusBadgeProps = {
  status: TournamentStatus;
  /** Override the default German label. */
  label?: string;
  className?: string;
};

/**
 * Small pill describing a tournament's lifecycle status.
 * `running` glows live-red, `registration` is lime, `draft`/`finished` are dim.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] whitespace-nowrap",
        config.className,
        className,
      )}
    >
      {config.dot && (
        <span
          aria-hidden
          className="inline-block size-1.5 rounded-full bg-current"
        />
      )}
      {label ?? config.label}
    </span>
  );
}
