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

export default async function OrganizerPage() {
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

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .order("created_at", { ascending: false });

  return (
    <>
      <OrganizerNav />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(197,247,46,0.07),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-12">
          <div className="mb-7">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Eingeloggt als Organizer
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              Turniere
            </h1>
          </div>

          {!tournaments || tournaments.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Es sind noch keine Turniere vorhanden.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {tournaments.map((tournament) => {
                const status = asStatus(tournament.status);
                return (
                  <li key={tournament.id}>
                    <Link
                      href={`/organizer/tournaments/${tournament.id}/participants`}
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
        </div>
      </main>
    </>
  );
}
