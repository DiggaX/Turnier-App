import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StationClient } from "./station-client";

export default async function CheckinStationPage(props: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await props.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/t/${tournamentId}/register`);
  }

  const { data: participant } = await supabase
    .from("participants")
    .select("id, display_name, checked_in_at")
    .eq("tournament_id", tournamentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!participant) {
    redirect(`/t/${tournamentId}/register`);
  }

  return (
    <main className="mx-auto w-full max-w-xl p-4 sm:p-8">
      <StationClient participant={participant} />
    </main>
  );
}
