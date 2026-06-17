import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Teilnehmer — Turnier-App",
};

const TYPE_LABELS: Record<string, string> = {
  solo: "Solo",
  team: "Team",
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
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!tournament) {
    notFound();
  }

  // Single query: embed consents (FK consents.participant_id -> participants.id)
  // so PostgREST returns each participant's consent rows. No N+1.
  const { data: participants } = await supabase
    .from("participants")
    .select("id, display_name, gamertag, type, checked_in_at, consents(id)")
    .eq("tournament_id", id)
    .order("display_name", { ascending: true });

  const rows = participants ?? [];

  return (
    <>
      <OrganizerNav />

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

          <div className="mb-4 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
            {rows.length} Teilnehmer
          </div>

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
                      Einwilligung
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
                          {hasConsent ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-lime/15 px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-lime">
                              Erteilt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-live/15 px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-live">
                              Keine
                            </span>
                          )}
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
