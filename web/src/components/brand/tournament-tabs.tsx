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
  /** Path segment under /organizer/tournaments/[id]/ — null for not-yet-built routes. */
  segment: string | null;
};

const TABS: TabDef[] = [
  { label: "Übersicht", segment: null },
  { label: "Teilnehmer", segment: "participants" },
  { label: "Check-in", segment: "checkin" },
  { label: "Bracket", segment: "bracket" },
  { label: "Matches", segment: null },
  { label: "Stationen", segment: null },
];

const TAB_BASE =
  "border-b-2 px-4 py-3 font-display text-[13px] uppercase tracking-[0.04em] transition-colors";

/**
 * Per-tournament tab bar for the organizer area. Live tabs (Teilnehmer,
 * Check-in, Bracket) link to their routes and the active one is highlighted
 * lime; the not-yet-built tabs (Übersicht, Matches, Stationen) render as dimmed,
 * non-interactive labels so they never 404.
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

        const href = `${base}/${tab.segment}`;
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
