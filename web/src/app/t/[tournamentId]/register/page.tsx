import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegisterClient } from "./register-client";

export default async function RegisterPage(props: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await props.params;
  const supabase = await createClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status, team_size")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.status !== "registration") {
    notFound();
  }

  const teamSize = tournament.team_size ?? 1;

  return (
    <RegisterClient
      tournament={{ id: tournament.id, name: tournament.name }}
      teamSize={teamSize}
    />
  );
}
