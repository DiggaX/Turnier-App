import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Organisator — Turnier-App",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Entwurf",
  registration: "Anmeldung",
  running: "Läuft",
  finished: "Beendet",
};

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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-xl font-medium">Turniere</h1>
        <form action={signOut}>
          <Button type="submit" variant="outline" size="sm">
            Abmelden
          </Button>
        </form>
      </div>

      {!tournaments || tournaments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Es sind noch keine Turniere vorhanden.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tournaments.map((tournament) => (
            <li key={tournament.id}>
              <Link
                href={`/organizer/tournaments/${tournament.id}/participants`}
                className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{tournament.name}</CardTitle>
                    <CardDescription>
                      {STATUS_LABELS[tournament.status] ?? tournament.status}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <span className="text-sm text-muted-foreground">
                      Teilnehmerliste ansehen →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
