import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MeClient, type CurrentMatch } from "./me-client";

/** A match row with the opponent display names embedded for resolution. */
type RawOpenMatch = {
  id: string;
  participant_a_id: string | null;
  participant_b_id: string | null;
  a: { display_name: string } | null;
  b: { display_name: string } | null;
};

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

  // The participant's current open match in this tournament: both slots filled,
  // not yet decided, and they are on one of the two sides.
  const { data: rawMatch } = await supabase
    .from("matches")
    .select(
      "id, participant_a_id, participant_b_id, " +
        "a:participant_a_id(display_name), b:participant_b_id(display_name)",
    )
    .eq("tournament_id", tournamentId)
    .in("status", ["pending", "live"])
    .not("participant_a_id", "is", null)
    .not("participant_b_id", "is", null)
    .or(
      `participant_a_id.eq.${participant.id},participant_b_id.eq.${participant.id}`,
    )
    .order("round", { ascending: true })
    .order("slot", { ascending: true })
    .limit(1)
    .maybeSingle()
    .overrideTypes<RawOpenMatch>();

  let currentMatch: CurrentMatch | null = null;
  if (rawMatch) {
    const mySide: "a" | "b" =
      rawMatch.participant_a_id === participant.id ? "a" : "b";
    const opponentName =
      (mySide === "a" ? rawMatch.b?.display_name : rawMatch.a?.display_name) ??
      "Gegner";

    // The participant's own existing report for this match, if any.
    const { data: myReport } = await supabase
      .from("match_reports")
      .select("score_a, score_b")
      .eq("match_id", rawMatch.id)
      .eq("reported_by", participant.id)
      .maybeSingle();

    currentMatch = {
      matchId: rawMatch.id,
      opponentName,
      mySide,
      myReport: myReport ?? null,
    };
  }

  return <MeClient participant={participant} currentMatch={currentMatch} tournamentId={tournamentId} />;
}
