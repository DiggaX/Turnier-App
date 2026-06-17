import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteNav } from "@/components/brand/site-nav";
import { StatusBadge } from "@/components/brand/status-badge";
import { createClient } from "@/lib/supabase/server";
import { formatLabel, modeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { TournamentStatus } from "@/lib/database.types";

/** Lifecycle phases in order, as shown in the design's "Status der Phasen". */
const PHASES: TournamentStatus[] = [
  "draft",
  "registration",
  "running",
  "finished",
];

/** Format a start timestamp in German, or "offen" when no date is set. */
function startLabel(startsAt: string | null): string {
  if (!startsAt) return "offen";
  return new Date(startsAt).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Two-letter game chip tag, mirroring the home list, e.g. "Valorant" → "VL". */
function gameTag(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase() || "??";
}

export default async function TournamentDetailPage(props: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await props.params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select(
      "id, name, format, mode, status, starts_at, games(name, team_size), participants(id)",
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) {
    notFound();
  }

  const gameName = tournament.games?.name ?? "Unbekanntes Spiel";
  const teamSize = tournament.games?.team_size;
  const isTeam = !!teamSize && teamSize > 1;
  const gameLine = isTeam ? `${gameName} · ${teamSize}v${teamSize}` : gameName;
  const participantCount = tournament.participants?.length ?? 0;
  const currentPhase = PHASES.indexOf(tournament.status);

  return (
    <>
      <SiteNav />

      <main className="relative overflow-hidden">
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_460px_at_80%_-5%,rgba(31,209,227,0.13),transparent_60%),radial-gradient(600px_460px_at_5%_5%,rgba(197,247,46,0.09),transparent_55%)]"
        />

        <div className="relative mx-auto max-w-[1080px] px-5 pb-20 pt-8 sm:px-9">
          {/* breadcrumb */}
          <div className="mb-5 font-display text-xs uppercase tracking-[0.12em] text-fg-dim">
            <Link href="/" className="transition-colors hover:text-fg-muted">
              / Turniere
            </Link>
            <span className="px-2 text-fg-dim/60">›</span>
            <span className="text-fg-muted">{tournament.name}</span>
          </div>

          {/* hero card */}
          <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface">
            {/* game art band */}
            <div className="relative flex min-h-[180px] items-end p-6 [background:repeating-linear-gradient(135deg,#161c27,#161c27_11px,#12161e_11px,#12161e_22px)] sm:min-h-[200px]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 [background:linear-gradient(transparent,rgba(16,20,28,0.95))]"
              />
              <span className="absolute right-5 top-5 font-display text-[11px] uppercase tracking-[0.12em] text-fg-dim/70">
                {gameTag(gameName)} Key Art
              </span>
              <div className="relative">
                <div className="mb-2 flex flex-wrap items-center gap-2.5">
                  <StatusBadge status={tournament.status} />
                  <span className="text-[12px] uppercase tracking-[0.14em] text-cyan">
                    {gameLine}
                  </span>
                </div>
                <h1 className="font-display text-3xl font-bold uppercase leading-[0.98] tracking-tight text-ink sm:text-[42px]">
                  {tournament.name}
                </h1>
              </div>
            </div>

            {/* facts row */}
            <div className="flex flex-wrap gap-4 border-b border-line px-6 py-5">
              <Fact label="Format" value={formatLabel(tournament.format)} />
              <Fact
                label={isTeam ? "Teams" : "Teilnehmer"}
                value={String(participantCount)}
              />
              <Fact label="Start" value={startLabel(tournament.starts_at)} />
              <Fact label="Modus" value={modeLabel(tournament.mode)} />
            </div>

            {/* primary actions */}
            <div className="flex flex-wrap gap-3 px-6 py-5">
              {tournament.status === "registration" && (
                <Link
                  href={`/t/${tournament.id}/register`}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-lime px-7 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90"
                >
                  Jetzt anmelden →
                </Link>
              )}
              {tournament.status === "running" && (
                <Link
                  href={`/t/${tournament.id}/board`}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-cyan/40 bg-cyan/[0.06] px-7 py-3.5 font-display text-sm font-semibold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/15"
                >
                  ▶ Live-Board
                </Link>
              )}
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-[10px] border border-line px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink"
              >
                ← Zurück
              </Link>
            </div>
          </div>

          {/* rules + phase stepper */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* rules */}
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="mb-3.5 font-display text-base font-semibold text-ink">
                Regeln &amp; Format
              </h2>
              <p className="text-sm leading-[1.7] text-fg-muted">
                Check-in öffnet 60 Min vor Start. No-Show = Disqualifikation nach
                10 Min. Die genauen Regeln und der Spielplan werden vom
                Veranstalter bekannt gegeben.
              </p>
            </section>

            {/* phase stepper */}
            <section className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="mb-3.5 font-display text-base font-semibold text-ink">
                Status der Phasen
              </h2>
              <ol className="flex flex-wrap items-center gap-2 font-display text-xs">
                {PHASES.map((phase, i) => {
                  const isCurrent = i === currentPhase;
                  const isDone = i < currentPhase;
                  return (
                    <li key={phase} className="flex items-center gap-2">
                      <span
                        data-phase={phase}
                        data-current={isCurrent ? "true" : undefined}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 lowercase tracking-wide transition-colors",
                          isCurrent &&
                            "bg-lime/15 text-lime shadow-[0_0_22px_rgba(197,247,46,0.25)]",
                          isDone && !isCurrent && "bg-lime/10 text-lime/80",
                          !isCurrent &&
                            !isDone &&
                            "bg-white/[0.06] text-fg-dim",
                        )}
                      >
                        {phase}
                      </span>
                      {i < PHASES.length - 1 && (
                        <span aria-hidden className="text-fg-dim/50">
                          ›
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

/** A single label/value cell in the hero facts row. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[130px] flex-1">
      <div className="mb-1.5 font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
        {label}
      </div>
      <div className="font-display text-base font-semibold text-ink">
        {value}
      </div>
    </div>
  );
}
