import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { createClient } from "@/lib/supabase/server";

import { MembersClient } from "./members-client";

export const metadata: Metadata = { title: "Mitglieder — Turnier-App" };

export default async function MembersPage() {
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
  if (profile.role !== "admin") {
    redirect("/organizer");
  }
  if (!profile.org_id) {
    redirect("/organizer");
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });

  const { data: invites } = await supabase
    .from("org_invites")
    .select("id, code, role, expires_at, accepted_at, created_at")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  const h = await headers();
  const origin =
    h.get("origin") ??
    (() => {
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
      const proto = h.get("x-forwarded-proto") ?? "https";
      return host ? `${proto}://${host}` : "";
    })();

  return (
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />
      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(197,247,46,0.07),transparent_60%)]"
        />
        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-10 sm:px-8 sm:pt-12">
          <h1 className="mb-7 font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
            Mitglieder
          </h1>
          <MembersClient
            members={members ?? []}
            invites={invites ?? []}
            currentUserId={user.id}
            origin={origin}
          />
        </div>
      </main>
    </>
  );
}
