import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { StatusBadge } from "@/components/brand/status-badge";
import { formatLabel, modeLabel } from "@/lib/labels";
import { teamLabel, canEditStructure } from "@/lib/tournament/lifecycle";
import { createClient } from "@/lib/supabase/server";
import { requireOrgTournament } from "@/lib/auth/org-tournament";
import { type TournamentFormat, type TournamentMode, type TournamentStatus } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format-date";

import { EditTournamentForm } from "./edit-tournament-form";
import { LifecycleControls } from "./lifecycle-controls";
import { COMPETITOR_TYPES } from "./participants/participant-types";

export const metadata: Metadata = { title: "Übersicht — Turnier-App" };

export default async function TournamentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
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
    mode: TournamentMode;
    status: TournamentStatus;
    team_size: number;
    starts_at: string | null;
    game_id: string;
    org_id: string;
    archived_at: string | null;
    games: { name: string } | { name: string }[] | null;
  }>(
    supabase,
    id,
    profile.org_id as string | null,
    "id, name, format, mode, status, team_size, starts_at, game_id, org_id, archived_at, games(name)",
  );

  // Gezaehlt werden WETTKAEMPFER: „12 Teilnehmer" muss bei einem Team-Turnier
  // die Zahl der Teams sein, sonst steht auf der Uebersicht die Zahl der Kinder
  // und die Orga plant mit der falschen Groesse.
  const [
    { count: pCount },
    { count: anyCount },
    { count: orphanCount },
    { count: mCount },
    { data: games },
  ] = await Promise.all([
    supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", id)
      .in("type", COMPETITOR_TYPES),
    // Fuer die Teamgroessen-Sperre zaehlt JEDE Zeile, auch ein Spieler ohne
    // Team: sein Typ haengt schon an der aktuellen Teamgroesse.
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    // Anwesend, aber niemand tritt fuer ihn an: ein Spieler ohne Mannschaft
    // ist selbst kein Wettkaempfer (§6) und wird von keiner Team-Zeile
    // vertreten — er bekommt kein Match. Bei einem Team-Turnier ist
    // „Personen > Wettkaempfer" der Normalfall, deshalb zaehlt hier nicht die
    // Differenz, sondern genau dieser Fall. Ein Kopfzaehler, kein Join.
    supabase
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", id)
      .eq("type", "player")
      .is("team_id", null)
      .not("checked_in_at", "is", null),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("games").select("id, name, team_size").order("name"),
  ]);
  const hasMatches = (mCount ?? 0) > 0;
  const orphans = orphanCount ?? 0;

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />
      <main className="relative flex-1 overflow-hidden">
        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Übersicht
            </div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
          </div>

          <TournamentTabs tournamentId={id} />

          <section className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-5">
            <StatusBadge status={tournament.status} />
            <span className="text-sm text-fg-muted">
              {Array.isArray(tournament.games) ? tournament.games[0]?.name : tournament.games?.name}
            </span>
            <span className="text-sm text-fg-muted">{formatLabel(tournament.format)}</span>
            <span className="text-sm text-fg-muted">{modeLabel(tournament.mode)}</span>
            <span className="text-sm text-fg-muted">{teamLabel(tournament.team_size)}</span>
            {tournament.starts_at && (
              <span className="text-sm text-fg-muted">
                {formatDateTime(tournament.starts_at)}
              </span>
            )}
            <span className="text-sm text-fg-muted">{pCount ?? 0} Teilnehmer</span>
            {/*
              Hier steht NUR die Zahl der Uebriggebliebenen. anyCount zaehlt jede
              participants-Zeile, also auch die Team-Zeilen selbst: bei 4 Teams à
              3 Kindern plus einem Restspieler haette „17 angemeldet" gestanden,
              obwohl 13 Menschen da sind. Die Zahl ist fuer die Teamgroessen-
              Sperre gedacht, nicht fuer die Anzeige.
            */}
            {orphans > 0 && (
              <p className="basis-full text-sm text-warn">
                {orphans === 1
                  ? "1 eingecheckter Spieler steht in keiner Mannschaft und bekommt kein Match."
                  : `${orphans} eingecheckte Spieler stehen in keiner Mannschaft und bekommen kein Match.`}
              </p>
            )}
          </section>

          <LifecycleControls
            tournamentId={id}
            status={tournament.status}
            isArchived={tournament.archived_at !== null}
          />

          <section className="mt-8">
            <h2 className="mb-4 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
              Bearbeiten
            </h2>
            <EditTournamentForm
              games={games ?? []}
              tournament={{
                id: tournament.id,
                name: tournament.name,
                gameId: tournament.game_id,
                format: tournament.format,
                mode: tournament.mode,
                teamSize: tournament.team_size,
                startsAt: tournament.starts_at,
              }}
              canEditStructure={canEditStructure(tournament.status, hasMatches)}
              canEditTeamSize={(anyCount ?? 0) === 0}
            />
          </section>
        </div>
      </main>
    </>
  );
}
