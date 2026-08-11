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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParticipantRow = {
  id: string;
  display_name: string;
  qr_token: string;
  checked_in_at: string | null;
  team_id: string | null;
  consents: { id: string }[];
};

export default async function MePage(props: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { tournamentId } = await props.params;
  const { token } = await props.searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let participant: ParticipantRow | null = null;
  let viaToken = false;

  if (user) {
    const { data } = await supabase
      .from("participants")
      .select("id, display_name, qr_token, checked_in_at, team_id, consents(id)")
      .eq("tournament_id", tournamentId)
      .eq("user_id", user.id)
      .maybeSingle();
    participant = data;
  }

  // No owning session (different device, cleared cookies, or never signed in
  // here) — fall back to the recovery token from a saved/shared link. The
  // token is the participant's own qr_token, already their bearer credential
  // for check-in, so resolving them by it here is the same trust model.
  if (!participant && token && UUID_RE.test(token)) {
    const { data: row } = await supabase
      .rpc("get_participant_by_qr_token", { p_qr_token: token })
      .maybeSingle();
    if (row && row.tournament_id === tournamentId) {
      participant = {
        id: row.id,
        display_name: row.display_name,
        qr_token: row.qr_token,
        checked_in_at: row.checked_in_at,
        // Der Token-Weg braucht sie nicht: das offene Match kommt hier aus
        // get_open_match_by_qr_token, das den Wettkaempfer selbst aufloest.
        team_id: null,
        consents: row.has_consent ? [{ id: "via-token" }] : [],
      };
      viaToken = true;
    }
  }

  if (!participant) {
    redirect(`/t/${tournamentId}/register`);
  }

  // The participant's current open match in this tournament: both slots filled,
  // not yet decided, and they are on one of the two sides.
  let currentMatch: CurrentMatch | null = null;

  if (viaToken && token) {
    // One RPC instead of the two queries below. matches is publicly readable,
    // but match_reports is not — its policy wants p.user_id = auth.uid(), and in
    // link mode there is no such session. Without the definer path an already
    // submitted score would never load, and every visit would show an empty
    // form as if nothing had been reported.
    const { data: row } = await supabase
      .rpc("get_open_match_by_qr_token", { p_qr_token: token })
      .maybeSingle();
    if (row) {
      currentMatch = {
        matchId: row.match_id,
        opponentName: row.opponent_name,
        mySide: row.my_side === "a" ? "a" : "b",
        myReport:
          row.report_score_a !== null && row.report_score_b !== null
            ? { score_a: row.report_score_a, score_b: row.report_score_b }
            : null,
      };
    }
  } else if (!viaToken) {
    // Im Spielplan steht der WETTKAEMPFER: bei einem Team-Mitglied die
    // Team-Zeile, sonst die eigene. coalesce(team_id, id) — wer hier die eigene
    // Zeile sucht, findet als Team-Spieler nie ein Match. Der Token-Weg ist in
    // der Datenbank schon so repariert, der Sitzungs-Weg hier war es nicht.
    const competitorId = participant.team_id ?? participant.id;

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
        `participant_a_id.eq.${competitorId},participant_b_id.eq.${competitorId}`,
      )
      .order("round", { ascending: true })
      .order("slot", { ascending: true })
      .limit(1)
      .maybeSingle()
      .overrideTypes<RawOpenMatch>();

    if (rawMatch) {
      const mySide: "a" | "b" =
        rawMatch.participant_a_id === competitorId ? "a" : "b";
      const opponentName =
        (mySide === "a"
          ? rawMatch.b?.display_name
          : rawMatch.a?.display_name) ?? "Gegner";

      // Die eigene Meldung zu diesem Match. match_reports.reported_by ist der
      // WETTKAEMPFER — die Meldung eines Team-Mitglieds ist die Meldung des
      // Teams, und genau die soll den anderen im Team angezeigt werden.
      const { data: myReport } = await supabase
        .from("match_reports")
        .select("score_a, score_b")
        .eq("match_id", rawMatch.id)
        .eq("reported_by", competitorId)
        .maybeSingle();

      currentMatch = {
        matchId: rawMatch.id,
        opponentName,
        mySide,
        myReport: myReport ?? null,
      };
    }
  }

  return (
    <MeClient
      participant={participant}
      currentMatch={currentMatch}
      tournamentId={tournamentId}
      viaToken={viaToken}
    />
  );
}
