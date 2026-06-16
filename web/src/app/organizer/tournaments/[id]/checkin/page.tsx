import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { QrCode } from "@/components/qr-code";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

import { ScannerClient } from "./scanner-client";

export const metadata: Metadata = {
  title: "Check-in — Turnier-App",
};

/** Read the request origin (scheme + host) for building absolute QR URLs. */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export default async function CheckinPage({
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

  const { data: participants } = await supabase
    .from("participants")
    .select("display_name, checked_in_at")
    .eq("tournament_id", id);

  // Sort present participants first, then by name.
  const rows = (participants ?? []).slice().sort((a, b) => {
    const aIn = a.checked_in_at ? 0 : 1;
    const bIn = b.checked_in_at ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return a.display_name.localeCompare(b.display_name, "de");
  });

  const origin = await getOrigin();
  const stationUrl = `${origin}/t/${id}/checkin-station`;
  const presentCount = rows.filter((r) => r.checked_in_at).length;

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
          Check-in — {presentCount} von {rows.length} anwesend
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ScannerClient tournamentId={id} />

        <Card>
          <CardHeader>
            <CardTitle>Stations-QR</CardTitle>
            <CardDescription>
              Teilnehmer scannen diesen Code, um sich selbst einzuchecken.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <QrCode
              value={stationUrl}
              ariaLabel="Stations-QR zum Self-Check-in"
            />
            <p className="break-all text-center text-xs text-muted-foreground">
              {stationUrl}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Anwesenheit</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Für dieses Turnier sind noch keine Teilnehmer angemeldet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={`${p.display_name}-${p.checked_in_at ?? ""}`}>
                  <TableCell className="font-medium">
                    {p.display_name}
                  </TableCell>
                  <TableCell>
                    {p.checked_in_at ? (
                      <Badge className="border-transparent bg-green-600/15 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                        Anwesend
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
