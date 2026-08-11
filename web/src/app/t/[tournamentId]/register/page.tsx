import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeJoinCode } from "./join-code";
import { RegisterClient } from "./register-client";

export default async function RegisterPage(props: {
  params: Promise<{ tournamentId: string }>;
  // ?join=CODE kommt vom Beitritts-QR eines Mitspielers. Was nicht wie ein Code
  // aussieht, wird verworfen statt weitergereicht — siehe normalizeJoinCode.
  searchParams: Promise<{ join?: string | string[] }>;
}) {
  const { tournamentId } = await props.params;
  const { join } = await props.searchParams;
  const supabase = await createClient();

  // organizations kommt mit: die verantwortliche Stelle steht im Wortlaut der
  // Fotoerlaubnis (siehe lib/consent-text.ts) und muss dem Teilnehmer angezeigt
  // werden, bevor er zustimmt.
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, team_size, organizations(name, address)")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.status !== "registration") {
    notFound();
  }

  const teamSize = tournament.team_size ?? 1;
  const org = tournament.organizations;

  return (
    <RegisterClient
      tournament={{ id: tournament.id, name: tournament.name }}
      teamSize={teamSize}
      org={{ name: org?.name ?? "der Veranstalter", address: org?.address ?? null }}
      joinCode={normalizeJoinCode(join)}
    />
  );
}
