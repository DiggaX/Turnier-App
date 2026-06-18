import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { createClient } from "@/lib/supabase/server";

import { GamesManager } from "./games-manager";

export const metadata: Metadata = { title: "Spiele — Turnier-App" };

export default async function GamesPage() {
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
  if (!profile || !["admin", "organizer"].includes(profile.role)) {
    redirect("/login");
  }

  const { data: games } = await supabase
    .from("games")
    .select("id, name, team_size")
    .order("name", { ascending: true });

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />
      <main className="relative flex-1 overflow-hidden">
        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-12">
          <div className="mb-7">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Spiele
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              Spiele
            </h1>
          </div>

          <GamesManager games={games ?? []} />
        </div>
      </main>
    </>
  );
}
