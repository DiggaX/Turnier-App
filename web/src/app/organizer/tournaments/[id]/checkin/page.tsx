import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { QrCode } from "@/components/qr-code";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireOrgTournament } from "@/lib/auth/org-tournament";

import { AttendanceRow } from "./attendance-row";
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
    .select("role, org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const tournament = await requireOrgTournament<{
    id: string;
    name: string;
    org_id: string;
  }>(
    supabase,
    id,
    profile.org_id as string | null,
    "id, name, org_id",
  );

  const { data: participants } = await supabase
    .from("participants")
    .select("id, display_name, checked_in_at")
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
    <>
      <OrganizerNav isAdmin={profile.role === "admin"} />

      <main className="relative flex-1 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_-5%,rgba(31,209,227,0.08),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-4xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Check-in
            </div>
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              {presentCount} von {rows.length} anwesend
            </p>
          </div>

          <TournamentTabs tournamentId={id} />

          <div className="grid gap-6 md:grid-cols-2">
            <ScannerClient tournamentId={id} />

            <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
              <div>
                <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
                  Stations-QR
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  Teilnehmer scannen diesen Code, um sich selbst einzuchecken.
                </p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-xl bg-white p-3">
                  <QrCode
                    value={stationUrl}
                    ariaLabel="Stations-QR zum Self-Check-in"
                  />
                </div>
                <p className="break-all text-center text-xs text-fg-muted">
                  {stationUrl}
                </p>
              </div>
            </div>
          </div>

          <section className="mt-8 flex flex-col gap-3">
            <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
              Anwesenheit
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-fg-muted">
                Für dieses Turnier sind noch keine Teilnehmer angemeldet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow className="border-line hover:bg-transparent">
                      <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                        Name
                      </TableHead>
                      <TableHead className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                        Status
                      </TableHead>
                      <TableHead className="text-right font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                        Aktion
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <AttendanceRow
                        key={p.id}
                        participantId={p.id}
                        tournamentId={id}
                        displayName={p.display_name}
                        checkedInAt={p.checked_in_at}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
