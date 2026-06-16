import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MeClient } from "./me-client";

export default async function MePage(props: {
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
    .select("id, display_name, qr_token, checked_in_at, consents(id)")
    .eq("tournament_id", tournamentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!participant) {
    redirect(`/t/${tournamentId}/register`);
  }

  return <MeClient participant={participant} />;
}
