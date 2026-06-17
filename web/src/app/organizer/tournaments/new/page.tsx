import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { createClient } from "@/lib/supabase/server";

import { NewTournamentForm } from "./new-tournament-form";

export const metadata: Metadata = { title: "Neues Turnier — Turnier-App" };

export default async function NewTournamentPage() {
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

  const { data: games } = await supabase
    .from("games")
    .select("id, name, team_size")
    .order("name", { ascending: true });

  return (
    <>
      <OrganizerNav />
      <main className="relative flex-1 overflow-hidden">
        <div className="relative mx-auto w-full max-w-xl px-5 pb-20 pt-10 sm:px-8">
          <h1 className="mb-6 font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
            Neues Turnier
          </h1>
          <NewTournamentForm games={games ?? []} />
        </div>
      </main>
    </>
  );
}
