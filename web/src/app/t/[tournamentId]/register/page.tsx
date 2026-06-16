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
    .select("id, name, status, game:games(team_size)")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.status !== "registration") {
    notFound();
  }

  const teamSize = tournament.game?.team_size ?? 1;

  return (
    <main className="mx-auto w-full max-w-xl p-4 sm:p-8">
      <RegisterClient
        tournament={{ id: tournament.id, name: tournament.name }}
        teamSize={teamSize}
      />
    </main>
  );
}
