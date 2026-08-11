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
  // Ein Turnier anlegen ist Leitungsarbeit. Seit 20260811110000 haengt die
  // tournaments-Policy an is_organizer(); ohne diesen Riegel fuellt ein
  // Schiedsrichter das Formular aus und bekommt beim Speichern nichts als eine
  // Fehlermeldung.
  if (!profile || !["admin", "organizer"].includes(profile.role)) {
    redirect("/organizer");
  }

  const { data: games } = await supabase
    .from("games")
    .select("id, name, team_size")
    .order("name", { ascending: true });

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />
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
