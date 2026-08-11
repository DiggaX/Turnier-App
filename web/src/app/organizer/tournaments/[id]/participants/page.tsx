import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { PhotoConsentChip } from "@/components/brand/photo-consent-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireOrgTournament } from "@/lib/auth/org-tournament";
import { AddParticipantForm } from "./add-participant-form";
import { AssignTeamSelect } from "./assign-team-select";
import { TYPE_LABELS } from "./participant-types";

export const metadata: Metadata = {
  title: "Teilnehmer — Turnier-App",
};

export default async function ParticipantsPage({
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
    org_id: string;
    team_size: number;
  }>(
    supabase,
    id,
    profile.org_id as string | null,
    "id, name, org_id, team_size",
  );

  // Eine Abfrage fuer beide Sorten Zeilen, danach in JS getrennt: die Spieler
  // eines Teams sind jetzt selbst participants (type='player', team_id -> Team),
  // team_members wird nicht mehr gelesen.
  const { data: participants } = await supabase
    .from("participants")
    .select(
      "id, display_name, gamertag, type, team_id, checked_in_at, consents(id)",
    )
    .eq("tournament_id", id)
    .order("display_name", { ascending: true });

  const all = participants ?? [];

  // Gezeigt werden die WETTKAEMPFER plus die Menschen ohne Team. Wer in einem
  // Team steht, taucht in dessen Spieler-Zahl und auf der Team-Detailseite auf
  // — sonst stuenden 4 Teams à 3 Spielern hier als 16 Zeilen, und „16
  // Teilnehmer" waere schlicht falsch. Ein Spieler ohne Team dagegen muss
  // sichtbar bleiben: um den muss sich jemand kuemmern.
  const rows = all.filter((p) => p.type !== "player" || p.team_id === null);
  const memberCount = new Map<string, number>();
  for (const p of all) {
    if (p.type === "player" && p.team_id) {
      memberCount.set(p.team_id, (memberCount.get(p.team_id) ?? 0) + 1);
    }
  }
  const teamSize = tournament.team_size ?? 1;

  // Die Mannschaften stehen schon in `all` (nach display_name sortiert) und
  // ihre Staerke in memberCount — eine zweite Abfrage waere dieselbe Zeile
  // zweimal geholt.
  const teams = all
    .filter((p) => p.type === "team")
    .map((t) => ({
      id: t.id,
      name: t.display_name,
      memberCount: memberCount.get(t.id) ?? 0,
    }));

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(31,209,227,0.08),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-4xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Turnier
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
          </div>

          <TournamentTabs tournamentId={id} />

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
              {rows.length} Teilnehmer
            </div>
            <Link
              href={`/organizer/tournaments/${id}/consents`}
              className="font-display text-[11px] uppercase tracking-[0.14em] text-cyan transition-colors hover:text-ink"
            >
              Fotoerlaubnisse drucken
            </Link>
          </div>

          <AddParticipantForm
            tournamentId={id}
            teamSize={tournament.team_size ?? 1}
            teams={teams}
          />

          {rows.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Für dieses Turnier sind noch keine Teilnehmer angemeldet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <Table>
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                      Name
                    </TableHead>
                    <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                      Gamertag
                    </TableHead>
                    <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                      Typ
                    </TableHead>
                    <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                      Spieler
                    </TableHead>
                    <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                      Fotoerlaubnis
                    </TableHead>
                    <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                      Check-in
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((participant) => {
                    const hasConsent =
                      (participant.consents ?? []).length > 0;
                    const rosterCount = memberCount.get(participant.id) ?? 0;
                    return (
                      <TableRow
                        key={participant.id}
                        className="border-line/60 hover:bg-white/[0.02]"
                      >
                        <TableCell className="font-display font-semibold text-ink">
                          <Link
                            href={`/organizer/tournaments/${id}/participants/${participant.id}`}
                            className="hover:text-lime transition-colors"
                          >
                            {participant.display_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {participant.gamertag ?? "—"}
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {TYPE_LABELS[participant.type] ?? participant.type}
                        </TableCell>
                        <TableCell>
                          {participant.type === "team" ? (
                            <span
                              className={
                                rosterCount === teamSize
                                  ? "text-lime"
                                  : "text-warn"
                              }
                            >
                              {rosterCount} / {teamSize}
                            </span>
                          ) : participant.type === "player" &&
                            participant.team_id === null ? (
                            // Ohne Team ist kein Fehler, sondern der zweite
                            // normale Fall — wie bei der Fotoerlaubnis darum
                            // grau und nicht rot. Daneben der kurze Weg, das
                            // sofort zu erledigen: sonst muesste die Orga den
                            // Teams-Screen suchen, waehrend das Kind vor ihr
                            // steht.
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center whitespace-nowrap rounded-md bg-white/[0.08] px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-fg-dim">
                                ohne Team
                              </span>
                              <AssignTeamSelect
                                tournamentId={id}
                                playerId={participant.id}
                                playerName={participant.display_name}
                                currentTeamId={participant.team_id}
                                teams={teams}
                                teamSize={teamSize}
                              />
                            </span>
                          ) : (
                            <span className="text-fg-dim">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <PhotoConsentChip granted={hasConsent} />
                        </TableCell>
                        <TableCell>
                          {participant.checked_in_at ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-lime/15 px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-lime">
                              Eingecheckt
                            </span>
                          ) : (
                            <span className="text-fg-dim">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
