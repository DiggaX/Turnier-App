import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { QrCode } from "@/components/qr-code";
import { createClient } from "@/lib/supabase/server";
import { requireOrgTournament } from "@/lib/auth/org-tournament";

import { ParticipantDetailClient } from "./participant-detail-client";
import { TYPE_LABELS } from "../participant-types";

export const metadata: Metadata = { title: "Teilnehmer — Turnier-App" };

export default async function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;
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
    org_id: string;
  }>(
    supabase,
    id,
    profile.org_id as string | null,
    "id, name, org_id",
  );

  const { data: participant } = await supabase
    .from("participants")
    .select("id, display_name, gamertag, birthdate, type, qr_token, checked_in_at, consents(id)")
    .eq("id", pid)
    .eq("tournament_id", id)
    .maybeSingle();
  if (!participant) notFound();

  const hasConsent = (participant.consents ?? []).length > 0;

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />
      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(31,209,227,0.08),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Teilnehmer
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
          </div>

          <TournamentTabs tournamentId={id} />

          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto]">
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
                Details
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                  Name
                </dt>
                <dd className="font-semibold text-ink">{participant.display_name}</dd>

                <dt className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                  Gamertag
                </dt>
                <dd className="text-fg-muted">{participant.gamertag ?? "—"}</dd>

                <dt className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                  Typ
                </dt>
                <dd className="text-fg-muted">{TYPE_LABELS[participant.type] ?? participant.type}</dd>

                <dt className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                  Geburtsdatum
                </dt>
                <dd className="text-fg-muted">
                  {participant.birthdate
                    ? new Date(participant.birthdate + "T12:00:00").toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })
                    : "—"}
                </dd>

                <dt className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                  Einwilligung
                </dt>
                <dd>
                  {hasConsent ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-lime/15 px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-lime">
                      Erteilt
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-live/15 px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-live">
                      Keine
                    </span>
                  )}
                </dd>

                <dt className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                  Check-in
                </dt>
                <dd>
                  {participant.checked_in_at ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-lime/15 px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-lime">
                      Eingecheckt
                    </span>
                  ) : (
                    <span className="text-fg-dim">—</span>
                  )}
                </dd>
              </dl>
            </section>

            <section className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-5">
              <div className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                QR-Code
              </div>
              <QrCode value={participant.qr_token} size={160} ariaLabel={`QR-Code für ${participant.display_name}`} />
            </section>
          </div>

          <ParticipantDetailClient
            participantId={participant.id}
            tournamentId={id}
            defaultDisplayName={participant.display_name}
            defaultGamertag={participant.gamertag}
          />
        </div>
      </main>
    </>
  );
}
