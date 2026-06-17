import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { StatusBadge } from "@/components/brand/status-badge";
import { formatLabel, modeLabel } from "@/lib/labels";
import { teamLabel } from "@/lib/tournament/lifecycle";
import { createClient } from "@/lib/supabase/server";

import { EditTournamentForm } from "./edit-tournament-form";
import { LifecycleControls } from "./lifecycle-controls";

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
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, format, mode, status, team_size, starts_at, game_id, games(name)")
    .eq("id", id)
    .maybeSingle();
  if (!tournament) notFound();

  const [{ count: pCount }, { count: mCount }, { data: games }] = await Promise.all([
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("games").select("id, name, team_size").order("name"),
  ]);
  const hasMatches = (mCount ?? 0) > 0;

  return (
    <>
      <OrganizerNav />
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
                {new Date(tournament.starts_at).toLocaleString("de-DE")}
              </span>
            )}
            <span className="text-sm text-fg-muted">{pCount ?? 0} Teilnehmer</span>
          </section>

          <LifecycleControls
            tournamentId={id}
            status={tournament.status}
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
              canEditStructure={!hasMatches}
            />
          </section>
        </div>
      </main>
    </>
  );
}
