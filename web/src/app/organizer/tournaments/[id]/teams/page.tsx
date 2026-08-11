import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { createClient } from "@/lib/supabase/server";
import { requireOrgTournament } from "@/lib/auth/org-tournament";
import { TeamsClient, type PlayerRow, type TeamRow } from "./teams-client";

export const metadata: Metadata = {
  title: "Teams — Turnier-App",
};

export default async function TeamsPage({
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

  // Mannschaften zusammenstellen ist Leitungsarbeit: jede Aktion auf diesem
  // Bildschirm ausser "Spielbereit" haengt seit 20260811110000 an
  // is_organizer(), ein Schiedsrichter saehe also lauter Knoepfe, die ins Leere
  // laufen. "Spielbereit" darf er weiterhin — dafuer gibt es den Teams-Block auf
  // der Check-in-Seite, die ohnehin seine Seite ist.
  if (!profile || !["admin", "organizer"].includes(profile.role)) {
    redirect(`/organizer/tournaments/${id}/checkin`);
  }

  const tournament = await requireOrgTournament<{
    id: string;
    name: string;
    org_id: string;
    team_size: number;
  }>(supabase, id, profile.org_id as string | null, "id, name, org_id, team_size");

  const teamSize = tournament.team_size ?? 1;

  // Eine Abfrage fuer beide Sorten Zeilen. Getrennt wird ueber `type`, niemals
  // ueber team_id: ein Spieler ohne Team traegt ebenfalls team_id NULL und waere
  // sonst ploetzlich eine Mannschaft.
  const { data: participants } = await supabase
    .from("participants")
    .select("id, display_name, gamertag, type, team_id, is_captain, checked_in_at, join_code")
    .eq("tournament_id", id)
    .order("display_name", { ascending: true });

  const rows = participants ?? [];
  const teams: TeamRow[] = rows
    .filter((p) => p.type === "team")
    .map((p) => ({
      id: p.id,
      display_name: p.display_name,
      join_code: p.join_code,
      checked_in_at: p.checked_in_at,
    }));
  const players: PlayerRow[] = rows
    .filter((p) => p.type === "player")
    .map((p) => ({
      id: p.id,
      display_name: p.display_name,
      gamertag: p.gamertag,
      team_id: p.team_id,
      is_captain: p.is_captain,
    }));

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(31,209,227,0.08),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Turnier
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
          </div>

          <TournamentTabs tournamentId={id} />

          {teamSize <= 1 ? (
            <p className="text-sm text-fg-muted">
              Dieses Turnier wird einzeln gespielt — es gibt keine Mannschaften.
            </p>
          ) : (
            <TeamsClient
              tournamentId={id}
              teamSize={teamSize}
              teams={teams}
              players={players}
            />
          )}
        </div>
      </main>
    </>
  );
}
