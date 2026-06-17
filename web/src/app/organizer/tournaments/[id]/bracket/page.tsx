import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  BracketView,
  type BracketMatch,
} from "@/components/brand/bracket-view";
import {
  DoubleElimView,
  type DoubleElimMatch,
} from "@/components/brand/double-elim-view";
import { OrganizerNav } from "@/components/brand/organizer-nav";
import { RoundRobinView } from "@/components/brand/round-robin-view";
import { SwissView, type SwissMatch } from "@/components/brand/swiss-view";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { formatLabel } from "@/lib/labels";
import type { DoneMatch } from "@/lib/standings";
import { createClient } from "@/lib/supabase/server";
import { swissRoundCount } from "@/lib/swiss/pairing";
import { swissStandings } from "@/lib/swiss/standings";

import { AdvanceRoundButton } from "./advance-round-button";
import { GenerateButton } from "./generate-button";
import { SeedingClient } from "./seeding-client";

export const metadata: Metadata = {
  title: "Bracket — Turnier-App",
};

/** A match row with the embedded participant rows PostgREST returns. */
type RawMatch = {
  id: string;
  bracket: string;
  round: number;
  slot: number;
  status: BracketMatch["status"];
  winner_id: string | null;
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  a: { display_name: string } | null;
  b: { display_name: string } | null;
};

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, format, status")
    .eq("id", id)
    .maybeSingle();

  if (!tournament) {
    notFound();
  }

  // Checked-in participants in seed order (for the seeding editor).
  const { data: checkedIn } = await supabase
    .from("participants")
    .select("id, display_name, seed")
    .eq("tournament_id", id)
    .not("checked_in_at", "is", null)
    .order("seed", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true });

  // Existing matches, joining participant names for sides a/b via the FKs.
  const { data: rawMatches } = await supabase
    .from("matches")
    .select(
      "id, bracket, round, slot, status, winner_id, participant_a_id, participant_b_id, " +
        "score_a, score_b, a:participant_a_id(display_name), b:participant_b_id(display_name)",
    )
    .eq("tournament_id", id)
    .order("round", { ascending: true })
    .order("slot", { ascending: true })
    .overrideTypes<RawMatch[]>();

  const matches: DoubleElimMatch[] = (rawMatches ?? []).map((m) => ({
    id: m.id,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    status: m.status,
    winnerId: m.winner_id,
    participantAId: m.participant_a_id,
    participantBId: m.participant_b_id,
    aName: m.a?.display_name ?? null,
    bName: m.b?.display_name ?? null,
  }));

  // Swiss-specific derived data (computed regardless of format; no-ops when empty).
  const swissMatches: SwissMatch[] = (rawMatches ?? []).map((m) => ({
    id: m.id,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    status: m.status,
    winnerId: m.winner_id,
    participantAId: m.participant_a_id,
    participantBId: m.participant_b_id,
    aName: m.a?.display_name ?? null,
    bName: m.b?.display_name ?? null,
    scoreA: m.score_a,
    scoreB: m.score_b,
  }));

  const names: Record<string, string> = {};
  for (const m of swissMatches) {
    if (m.participantAId && m.aName) names[m.participantAId] = m.aName;
    if (m.participantBId && m.bName) names[m.participantBId] = m.bName;
  }

  const doneForStandings: DoneMatch[] = swissMatches
    .filter(
      (m) =>
        m.status === "done" &&
        m.participantAId &&
        m.participantBId &&
        m.scoreA != null &&
        m.scoreB != null,
    )
    .map((m) => ({
      participantAId: m.participantAId!,
      participantBId: m.participantBId!,
      scoreA: m.scoreA!,
      scoreB: m.scoreB!,
    }));
  const byeIdsForStandings = swissMatches
    .filter((m) => m.status === "bye")
    .map((m) => m.winnerId ?? m.participantAId)
    .filter((x): x is string => !!x);
  const swissStandingRows = swissStandings(doneForStandings, byeIdsForStandings);

  const entrantCount = new Set(
    swissMatches
      .filter((m) => m.round === 1)
      .flatMap((m) => [m.participantAId, m.participantBId])
      .filter((x): x is string => !!x),
  ).size;
  const currentRound = swissMatches.length
    ? Math.max(...swissMatches.map((m) => m.round))
    : 0;
  const totalRounds = swissRoundCount(entrantCount);
  const currentRoundComplete =
    currentRound > 0 &&
    swissMatches
      .filter((m) => m.round === currentRound)
      .every((m) => m.status === "done" || m.status === "bye");

  const hasMatches = matches.length > 0;
  const seedParticipants = (checkedIn ?? []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
  }));

  return (
    <>
      <OrganizerNav />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(31,209,227,0.08),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-5xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Bracket
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
            <p className="mt-2 font-display text-xs uppercase tracking-[0.14em] text-cyan">
              {formatLabel(tournament.format)}
            </p>
          </div>

          <TournamentTabs tournamentId={id} />

          {!hasMatches ? (
            <div className="flex flex-col gap-8">
              <section className="flex flex-col gap-4">
                <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
                  Seeding
                </h2>
                {seedParticipants.length === 0 ? (
                  <p className="text-sm text-fg-muted">
                    Noch keine eingecheckten Teilnehmer. Das Bracket kann erst
                    nach dem Check-in generiert werden.
                  </p>
                ) : (
                  <SeedingClient
                    tournamentId={id}
                    participants={seedParticipants}
                  />
                )}
              </section>

              {seedParticipants.length >= 2 && (
                <section className="flex flex-col gap-3 border-t border-line pt-6">
                  <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
                    Bracket generieren
                  </h2>
                  <p className="text-sm text-fg-muted">
                    Erzeugt den Spielplan aus den eingecheckten Teilnehmern in
                    Seeding-Reihenfolge. Das Turnier wechselt danach in den
                    Status „Läuft“.
                  </p>
                  <GenerateButton tournamentId={id} />
                </section>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <section className="flex flex-col gap-4">
                <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
                  Spielplan
                </h2>
                {tournament.format === "swiss" ? (
                  <div className="flex flex-col gap-6">
                    <SwissView
                      matches={swissMatches}
                      standings={swissStandingRows}
                      names={names}
                    />
                    {currentRoundComplete && currentRound < totalRounds && (
                      <AdvanceRoundButton tournamentId={id} />
                    )}
                    {currentRound >= totalRounds && totalRounds > 0 && (
                      <p className="font-display text-sm uppercase tracking-[0.12em] text-lime">
                        Alle {totalRounds} Runden gespielt — Endstand steht.
                      </p>
                    )}
                  </div>
                ) : tournament.format === "round_robin" ? (
                  <RoundRobinView matches={matches} />
                ) : tournament.format === "double_elim" ? (
                  <DoubleElimView matches={matches} />
                ) : (
                  <BracketView matches={matches} />
                )}
              </section>

              <section className="flex flex-col gap-3 border-t border-line pt-6">
                <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
                  Bracket neu generieren
                </h2>
                <GenerateButton tournamentId={id} regenerate />
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
