import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import {
  StatusBadge,
  type TournamentStatus,
} from "@/components/brand/status-badge";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Organisator — Turnier-App",
};

const KNOWN_STATUS: TournamentStatus[] = [
  "draft",
  "registration",
  "running",
  "finished",
];

function asStatus(status: string): TournamentStatus {
  return (KNOWN_STATUS as string[]).includes(status)
    ? (status as TournamentStatus)
    : "draft";
}

export default async function OrganizerPage(props: {
  searchParams: Promise<{ archiv?: string }>;
}) {
  const { archiv } = await props.searchParams;
  const showArchive = archiv === "1";
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
    // Signed in, but this account belongs to no organisation. Bouncing silently
    // is indistinguishable from a failed login — say why.
    redirect("/login?error=noaccess");
  }

  // Spec: when org_id is null, render the empty state at the application layer.
  let tournaments: { id: string; name: string; status: string }[] = [];
  let archivedCount = 0;
  if (profile.org_id) {
    const listQuery = supabase
      .from("tournaments")
      .select("id, name, status")
      .eq("org_id", profile.org_id)
      .order("created_at", { ascending: false });

    const [{ data }, { count }] = await Promise.all([
      showArchive
        ? listQuery.not("archived_at", "is", null)
        : listQuery.is("archived_at", null),
      supabase
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", profile.org_id)
        .not("archived_at", "is", null),
    ]);
    tournaments = data ?? [];
    archivedCount = count ?? 0;
  }

  const isAdmin = profile.role === "admin";

  return (
    <>
      <OrganizerNav isAdmin={isAdmin} />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(197,247,46,0.07),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-12">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
                Eingeloggt als Organizer
              </div>
              <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
                {showArchive ? "Archiv" : "Turniere"}
              </h1>
            </div>
            <Link
              href="/organizer/tournaments/new"
              className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90"
            >
              ＋ Neues Turnier
            </Link>
          </div>

          {!tournaments || tournaments.length === 0 ? (
            <p className="text-sm text-fg-muted">
              {showArchive
                ? "Das Archiv ist leer."
                : "Es sind noch keine Turniere vorhanden."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {tournaments.map((tournament) => {
                const status = asStatus(tournament.status);
                return (
                  <li key={tournament.id}>
                    <Link
                      href={`/organizer/tournaments/${tournament.id}`}
                      className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 outline-none transition-colors hover:border-lime/40 focus-visible:ring-2 focus-visible:ring-ring sm:p-[18px_22px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-lg font-semibold text-ink">
                          {tournament.name}
                        </div>
                      </div>
                      <StatusBadge status={status} />
                      <span className="hidden font-display text-xs uppercase tracking-[0.1em] text-cyan transition-colors group-hover:text-lime sm:inline">
                        Verwalten →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {(showArchive || archivedCount > 0) && (
            <Link
              href={showArchive ? "/organizer" : "/organizer?archiv=1"}
              className="mt-7 inline-block font-display text-xs uppercase tracking-[0.12em] text-fg-muted transition-colors hover:text-ink"
            >
              {showArchive
                ? "← Zurück zu den Turnieren"
                : `Archiv ansehen (${archivedCount}) →`}
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
