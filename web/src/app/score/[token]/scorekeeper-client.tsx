"use client";

import { ParticipantShell } from "@/components/brand/participant-shell";
import { LiveScoreControl } from "@/components/live-score-control";
import type { Database } from "@/lib/database.types";

type ScorekeeperMatch =
  Database["public"]["Functions"]["get_scorekeeper_match"]["Returns"][number];

type ScorekeeperClientProps = {
  token: string;
  initialMatch: ScorekeeperMatch;
};

/**
 * The scorekeeper's own page: the shared live control in a full-page shell.
 * The control itself lives in @/components/live-score-control because the
 * organizer match list embeds the same thing.
 */
export function ScorekeeperClient({
  token,
  initialMatch,
}: ScorekeeperClientProps) {
  const pairing = [
    initialMatch.participant_a_name ?? "TBD",
    initialMatch.participant_b_name ?? "TBD",
  ].join(" vs ");

  return (
    <ParticipantShell
      eyebrow="/ Live-Score"
      heading={initialMatch.tournament_name}
      subheading={pairing}
      glow="cyan"
    >
      <LiveScoreControl token={token} initialMatch={initialMatch} />
    </ParticipantShell>
  );
}
