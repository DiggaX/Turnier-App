import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Teilnehmer — Turnier-App",
};

const TYPE_LABELS: Record<string, string> = {
  solo: "Solo",
  team: "Team",
};

export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (!tournament) {
    notFound();
  }

  // Single query: embed consents (FK consents.participant_id -> participants.id)
  // so PostgREST returns each participant's consent rows. No N+1.
  const { data: participants } = await supabase
    .from("participants")
    .select("id, display_name, gamertag, type, checked_in_at, consents(id)")
    .eq("tournament_id", id)
    .order("display_name", { ascending: true });

  const rows = participants ?? [];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/organizer"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Zurück zu den Turnieren
        </Link>
        <h1 className="font-heading text-xl font-medium">{tournament.name}</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "Teilnehmer" : "Teilnehmer"}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Für dieses Turnier sind noch keine Teilnehmer angemeldet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Gamertag</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Einwilligung</TableHead>
              <TableHead>Check-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((participant) => {
              const hasConsent = (participant.consents ?? []).length > 0;
              return (
                <TableRow key={participant.id}>
                  <TableCell className="font-medium">
                    {participant.display_name}
                  </TableCell>
                  <TableCell>{participant.gamertag ?? "—"}</TableCell>
                  <TableCell>
                    {TYPE_LABELS[participant.type] ?? participant.type}
                  </TableCell>
                  <TableCell>
                    {hasConsent ? (
                      <Badge className="border-transparent bg-green-600/15 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                        Erteilt
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Keine</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {participant.checked_in_at ? (
                      <Badge variant="secondary">Eingecheckt</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
