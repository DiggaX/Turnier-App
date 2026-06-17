"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type TournamentTabsProps = {
  /** Tournament id used to build the per-tab hrefs. */
  tournamentId: string;
  className?: string;
};

type TabDef = {
  label: string;
  /**
   * Path segment under /organizer/tournaments/[id]/.
   * Empty string "" means the tab links to the base route (no segment appended).
   * null means the route doesn't exist yet — renders as a dimmed placeholder.
   */
  segment: string | null;
};

const TABS: TabDef[] = [
  { label: "Übersicht", segment: "" },
  { label: "Teilnehmer", segment: "participants" },
  { label: "Check-in", segment: "checkin" },
  { label: "Bracket", segment: "bracket" },
  { label: "Matches", segment: "matches" },
  { label: "Stationen", segment: "station" },
];

const TAB_BASE =
  "border-b-2 px-4 py-3 font-display text-[13px] uppercase tracking-[0.04em] transition-colors";

/**
 * Per-tournament tab bar for the organizer area. All live tabs link to their
 * routes and the active one is highlighted lime. Tabs with segment="" link to
 * the base route (/organizer/tournaments/[id]); tabs with segment=null are
 * rendered as dimmed, non-interactive placeholders for not-yet-built routes.
 */
export function TournamentTabs({ tournamentId, className }: TournamentTabsProps) {
  const pathname = usePathname();
  const base = `/organizer/tournaments/${tournamentId}`;

  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap gap-1 border-b border-line",
        className,
      )}
    >
      {TABS.map((tab) => {
        if (tab.segment === null) {
          // Placeholder: route doesn't exist yet — dimmed, not a link.
          return (
            <span
              key={tab.label}
              aria-disabled="true"
              className={cn(
                TAB_BASE,
                "cursor-not-allowed border-transparent text-fg-dim",
              )}
            >
              {tab.label}
            </span>
          );
        }

        // segment "" = base route (Übersicht); otherwise append the segment
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = pathname === href;

        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              TAB_BASE,
              active
                ? "border-lime text-lime"
                : "border-transparent text-fg-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
