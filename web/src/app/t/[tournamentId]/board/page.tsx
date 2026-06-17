import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { computeStandings, type DoneMatch } from "@/lib/standings";
import { createClient } from "@/lib/supabase/server";

import { BoardContent, type BoardMatch } from "./board-content";
import { LiveBoard } from "./live-board";

export const metadata: Metadata = {
  title: "Live-Board — Turnier-App",
};

/** A match row with embedded participant names, as PostgREST returns it. */
type RawMatch = {
  id: string;
  bracket: string;
  round: number;
  slot: number;
  status: BoardMatch["status"];
  winner_id: string | null;
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  a: { display_name: string } | null;
  b: { display_name: string } | null;
};

export default async function BoardPage(props: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await props.params;

  // Public board — anon client, NO auth guard. Tournament + matches are
  // public-read via RLS, so the beamer view works without a login.
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, format, status, games(name)")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) {
    notFound();
  }

  // All matches with embedded side names + scores, ordered for stable layout.
  const { data: rawMatches } = await supabase
    .from("matches")
    .select(
      "id, bracket, round, slot, status, winner_id, participant_a_id, participant_b_id, " +
        "score_a, score_b, a:participant_a_id(display_name), b:participant_b_id(display_name)",
    )
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("slot", { ascending: true })
    .overrideTypes<RawMatch[]>();

  const matchRows = rawMatches ?? [];

  const matches: BoardMatch[] = matchRows.map((m) => ({
    id: m.id,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    status: m.status,
    aName: m.a?.display_name ?? null,
    bName: m.b?.display_name ?? null,
    winnerId: m.winner_id,
    participantAId: m.participant_a_id,
    participantBId: m.participant_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
  }));

  // id → display name, harvested from the embedded match sides (covers every
  // participant that appears in a pairing, which is all the standings need).
  const names: Record<string, string> = {};
  for (const m of matchRows) {
    if (m.participant_a_id && m.a) names[m.participant_a_id] = m.a.display_name;
    if (m.participant_b_id && m.b) names[m.participant_b_id] = m.b.display_name;
  }

  // Round-robin standings from the decided matches.
  const isRoundRobin = tournament.format === "round_robin";
  const standings = isRoundRobin
    ? computeStandings(
        matchRows
          .filter(
            (m) =>
              m.status === "done" &&
              m.participant_a_id != null &&
              m.participant_b_id != null &&
              m.score_a != null &&
              m.score_b != null,
          )
          .map<DoneMatch>((m) => ({
            participantAId: m.participant_a_id!,
            participantBId: m.participant_b_id!,
            scoreA: m.score_a!,
            scoreB: m.score_b!,
          })),
      )
    : [];

  return (
    <LiveBoard tournamentId={tournament.id}>
      <BoardContent
        name={tournament.name}
        gameName={tournament.games?.name ?? null}
        status={tournament.status}
        format={tournament.format}
        matches={matches}
        names={names}
        standings={standings}
      />
    </LiveBoard>
  );
}
