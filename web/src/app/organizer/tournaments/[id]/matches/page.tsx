import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { StandingsTable } from "@/components/brand/standings-table";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { formatLabel } from "@/lib/labels";
import { computeStandings, type DoneMatch } from "@/lib/standings";
import { requireOrgTournament } from "@/lib/auth/org-tournament";
import { type TournamentFormat, type TournamentStatus } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { teamRosterLines } from "@/lib/tournament/team-roster";

import { bulkConfirmable } from "@/lib/station/station";

import { BulkConfirm } from "./bulk-confirm";
import { MatchesRealtime } from "./matches-realtime";
import { ReportRow, type MatchRowView } from "./report-row";
import { NotifyButton } from "./notify-button";

export const metadata: Metadata = {
  title: "Matches — Turnier-App",
};

/** A match row with embedded participant names, as PostgREST returns it. */
type RawMatch = {
  id: string;
  round: number;
  slot: number;
  status: MatchRowView["status"];
  winner_id: string | null;
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  a: { display_name: string } | null;
  live_score_a: number | null;
  live_score_b: number | null;
  live_ended_at: string | null;
  b: { display_name: string } | null;
};

type RawReport = {
  match_id: string;
  reported_by: string;
  /** The PERSON behind the report — at a team tournament some member reported. */
  reported_by_person: string | null;
  score_a: number;
  score_b: number;
};

export default async function MatchesPage({
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
    .select("role, org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const tournament = await requireOrgTournament<{
    id: string;
    name: string;
    format: TournamentFormat;
    status: TournamentStatus;
    org_id: string;
    team_size: number;
  }>(
    supabase,
    id,
    profile.org_id as string | null,
    "id, name, format, status, org_id, team_size",
  );

  // Matches with embedded side names + scores, ordered for stable rendering.
  const { data: rawMatches } = await supabase
    .from("matches")
    .select(
      "id, round, slot, status, winner_id, participant_a_id, participant_b_id, " +
        "score_a, score_b, live_score_a, live_score_b, live_ended_at, a:participant_a_id(display_name), b:participant_b_id(display_name)",
    )
    .eq("tournament_id", id)
    .order("round", { ascending: true })
    .order("slot", { ascending: true })
    .overrideTypes<RawMatch[]>();

  const matchRows = rawMatches ?? [];
  const matchIds = matchRows.map((m) => m.id);

  // Aufstellungen fuer die Match-Zeilen: im Spielplan steht bei Teamturnieren
  // nur der Teamname, am Tresen braucht die Orga aber die Kinder dazu. Eine
  // Abfrage fuers ganze Turnier, gruppiert wird in TS. Als Staff darf hier
  // direkt gelesen werden — die RPC get_team_rosters ist nur fuer anon noetig.
  const { data: rosterRows } =
    tournament.team_size > 1
      ? await supabase
          .from("participants")
          .select("team_id, display_name, is_captain")
          .eq("tournament_id", id)
          .eq("type", "player")
          .not("team_id", "is", null)
          .order("created_at", { ascending: true })
      : { data: [] };
  const rosterByTeam = teamRosterLines(rosterRows ?? []);

  // All player reports for those matches (one round-trip).
  let rawReports: RawReport[] = [];
  if (matchIds.length > 0) {
    const { data } = await supabase
      .from("match_reports")
      .select("match_id, reported_by, reported_by_person, score_a, score_b")
      .in("match_id", matchIds)
      .overrideTypes<RawReport[]>();
    rawReports = data ?? [];
  }

  // Resolve reporter participant ids → display names so reports show who said
  // what. The match embeds only cover the two current slots, so look up any
  // reporter not already named (covers reports lingering from prior rounds).
  const nameById = new Map<string, string>();
  for (const m of matchRows) {
    if (m.participant_a_id && m.a) nameById.set(m.participant_a_id, m.a.display_name);
    if (m.participant_b_id && m.b) nameById.set(m.participant_b_id, m.b.display_name);
  }
  // Auch die meldende PERSON aufloesen: bei einem Teamturnier meldet irgendein
  // Mitglied fuer sein Team, und wenn die Orga nachfragen muss, braucht sie den
  // Namen. Die Person steht nie in den Match-Slots, also immer nachschlagen.
  const missingReporterIds = [
    ...new Set(
      rawReports
        .flatMap((r) => [r.reported_by, r.reported_by_person])
        .filter((pid): pid is string => pid != null && !nameById.has(pid)),
    ),
  ];
  if (missingReporterIds.length > 0) {
    // Bewusst ohne type-Filter: hier wird nicht aufgezaehlt, sondern zu bereits
    // bekannten Ids der Name geholt. reported_by ist der Wettkaempfer, aber ein
    // Filter wuerde spaeter nur dafuer sorgen, dass ein Name als „—" erscheint.
    const { data: extra } = await supabase
      .from("participants")
      .select("id, display_name")
      .in("id", missingReporterIds);
    for (const p of extra ?? []) nameById.set(p.id, p.display_name);
  }

  const reportsByMatch = new Map<string, RawReport[]>();
  for (const r of rawReports) {
    const list = reportsByMatch.get(r.match_id) ?? [];
    list.push(r);
    reportsByMatch.set(r.match_id, list);
  }

  const { data: scorekeeperTokenRows } =
    matchIds.length > 0
      ? await supabase.rpc("get_scorekeeper_tokens", {
          p_match_ids: matchIds,
        })
      : { data: [] };
  const scorekeeperTokenByMatch = new Map(
    (scorekeeperTokenRows ?? []).map((row) => [row.match_id, row.token]),
  );
  const rows: MatchRowView[] = matchRows.map((m) => ({
    id: m.id,
    round: m.round,
    slot: m.slot,
    status: m.status,
    aName: m.a?.display_name ?? null,
    bName: m.b?.display_name ?? null,
    aRoster: rosterByTeam.get(m.participant_a_id ?? "") ?? null,
    bRoster: rosterByTeam.get(m.participant_b_id ?? "") ?? null,
    winnerId: m.winner_id,
    participantAId: m.participant_a_id,
    liveScoreA: m.live_score_a,
    liveScoreB: m.live_score_b,
    liveEndedAt: m.live_ended_at,
    scorekeeperToken: scorekeeperTokenByMatch.get(m.id) ?? null,
    participantBId: m.participant_b_id,
    scoreA: m.score_a,
    scoreB: m.score_b,
    reports: (reportsByMatch.get(m.id) ?? []).map((r) => ({
      byName: nameById.get(r.reported_by) ?? null,
      personName:
        r.reported_by_person != null
          ? (nameById.get(r.reported_by_person) ?? null)
          : null,
      scoreA: r.score_a,
      scoreB: r.score_b,
    })),
  }));

  // Alles, was beide Seiten gleich gemeldet haben — fuer die Sammel-Freigabe.
  const confirmable = bulkConfirmable(rows);

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
  const standingsNames = Object.fromEntries(nameById);

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />
      <MatchesRealtime tournamentId={id} />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(31,209,227,0.08),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Matches
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
            <p className="mt-2 font-display text-xs uppercase tracking-[0.14em] text-cyan">
              {formatLabel(tournament.format)}
            </p>
          </div>

          <TournamentTabs tournamentId={id} />

          <div className="mb-6">
            <NotifyButton tournamentId={id} />
          </div>

          <BulkConfirm items={confirmable} />

          {isRoundRobin && (
            <section className="mb-8 flex flex-col gap-4">
              <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
                Tabelle
              </h2>
              <StandingsTable rows={standings} names={standingsNames} />
            </section>
          )}

          <section className="flex flex-col gap-4">
            <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
              Ergebnisse
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-fg-muted">
                Noch keine Matches. Generiere zuerst das Bracket.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {rows.map((row) => (
                  <ReportRow key={row.id} match={row} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
