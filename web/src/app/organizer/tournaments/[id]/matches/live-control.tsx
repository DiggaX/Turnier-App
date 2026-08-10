"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Gamepad2 } from "lucide-react";

import {
  LiveScoreControl,
  type LiveMatchView,
} from "@/components/live-score-control";
import { Button } from "@/components/ui/button";

export type LiveControlProps = {
  token: string;
  match: LiveMatchView;
};

/**
 * The scorekeeper controls, embedded in the organizer's match row.
 *
 * For events without a dedicated scorekeeper: the orga starts the match,
 * counts, and ends it from the same screen they confirm the result on. Runs on
 * the match token the page already loaded via get_scorekeeper_tokens, so no
 * new privilege is involved — the same link, on a screen the staff holds.
 *
 * Collapsed while the match is pending so the list stays readable, and open
 * once it is live, since that is the row being worked on.
 */
export function LiveControl({ token, match }: LiveControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(match.status === "live");

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-fit font-display text-xs font-bold uppercase tracking-wider"
        onClick={() => setOpen(true)}
      >
        <Gamepad2 data-icon="inline-start" />
        Selbst steuern
      </Button>
    );
  }

  return (
    <LiveScoreControl
      token={token}
      initialMatch={match}
      onChange={() => router.refresh()}
    />
  );
}
