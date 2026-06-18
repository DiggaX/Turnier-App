import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteNav } from "@/components/brand/site-nav";
import { TournamentCard } from "@/components/brand/tournament-card";
import { createPublicClient } from "@/lib/supabase/public";
import { formatLabel } from "@/lib/labels";
import type { TournamentStatus } from "@/lib/database.types";
import { teamLabel, gameTag } from "@/lib/tournament/lifecycle";

/** Sort order: running first, then registration, then drafts, then finished. */
const STATUS_RANK: Record<TournamentStatus, number> = {
  running: 0,
  registration: 1,
  draft: 2,
  finished: 3,
};

const TAG_COLOR_BY_STATUS: Record<
  TournamentStatus,
  "lime" | "cyan" | "muted"
> = {
  running: "lime",
  registration: "cyan",
  draft: "muted",
  finished: "muted",
};

/** Format the time line: format label · localized start date (German). */
function metaLine(format: string, startsAt: string | null): string {
  if (!startsAt) return format;
  const when = new Date(startsAt).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${format} · ${when}`;
}

export default async function OrgPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) notFound();

  const { data } = await supabase
    .from("tournaments")
    .select(
      "id, name, format, mode, status, starts_at, team_size, games(name), participants(id)",
    )
    .eq("org_id", org.id)
    .order("starts_at", { ascending: true, nullsFirst: false });

  const tournaments = (data ?? [])
    .slice()
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);

  return (
    <>
      <SiteNav />

      <main className="relative overflow-hidden">
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_460px_at_80%_-5%,rgba(31,209,227,0.13),transparent_60%),radial-gradient(600px_460px_at_5%_5%,rgba(197,247,46,0.09),transparent_55%)]"
        />

        <div className="relative mx-auto max-w-[1080px] px-5 pb-20 pt-14 sm:px-9">
          {/* heading */}
          <h1 className="font-display text-4xl font-bold uppercase leading-[0.98] tracking-tight text-ink sm:text-6xl">
            {org.name}
          </h1>
          <p className="mt-4 max-w-[480px] text-base text-fg-muted sm:text-lg">
            Turniere dieser Organisation auf einen Blick.
          </p>

          {/* tournament list */}
          <div className="mt-10 flex flex-col gap-3.5">
            {tournaments.length === 0 && (
              <div className="rounded-2xl border border-line bg-surface p-8 text-center text-fg-muted">
                Diese Organisation hat noch keine Turniere ausgeschrieben.
              </div>
            )}

            {tournaments.map((t) => {
              const gameName = t.games?.name ?? "Unbekanntes Spiel";
              const teamSize = t.team_size ?? 1;
              const gameLine =
                teamSize > 1
                  ? `${gameName} · ${teamLabel(teamSize)}`
                  : gameName;
              const count = t.participants?.length ?? 0;

              return (
                <TournamentCard
                  key={t.id}
                  gameTag={gameTag(gameName)}
                  game={gameLine}
                  title={t.name}
                  status={t.status}
                  meta={metaLine(formatLabel(t.format), t.starts_at)}
                  participantCount={count}
                  tagColor={TAG_COLOR_BY_STATUS[t.status]}
                  dim={t.status === "draft" || t.status === "finished"}
                  action={<CardActions id={t.id} status={t.status} />}
                />
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}

/** Per-status action buttons, mirroring the design's lime/cyan/muted styles. */
function CardActions({
  id,
  status,
}: {
  id: string;
  status: TournamentStatus;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {status === "registration" && (
        <Link
          href={`/t/${id}/register`}
          className="rounded-lg bg-lime px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90"
        >
          Anmelden
        </Link>
      )}
      {status === "running" && (
        <Link
          href={`/t/${id}/board`}
          className="rounded-lg border border-cyan/35 bg-cyan/10 px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/20"
        >
          Live-Board
        </Link>
      )}
      <Link
        href={`/t/${id}`}
        className="rounded-lg border border-line px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink"
      >
        Details
      </Link>
    </div>
  );
}
