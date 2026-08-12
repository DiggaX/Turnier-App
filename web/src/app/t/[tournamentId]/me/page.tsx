import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { MatchStatus, TournamentStatus } from "@/lib/database.types";
import {
  queueStatus,
  type Pacing,
  type QueueMatch,
} from "@/lib/queue/wait-estimate";

import { MeClient } from "./me-client";
import type { MyMatch, MyReport } from "./my-matches";
import type { TeamInfo } from "./team-card";

/** A match row with the side display names embedded, as PostgREST returns it. */
type RawMatch = {
  id: string;
  round: number;
  slot: number;
  status: MatchStatus;
  participant_a_id: string | null;
  participant_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  live_score_a: number | null;
  live_score_b: number | null;
  live_ended_at: string | null;
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
        // Seit 20260812100000 liefert die RPC team_id mit. Bei Teams ist das
        // der Wettkaempfer aus dem Spielplan — ohne ihn bliebe die Partienliste
        // leer, sobald keine Partie mehr offen ist (HANDOVER §7.32).
        team_id: row.team_id ?? null,
        consents: row.has_consent ? [{ id: "via-token" }] : [],
      };
      viaToken = true;
    }
  }

  if (!participant) {
    redirect(`/t/${tournamentId}/register`);
  }

  // AB HIER der anon-Client. Eine angemeldete Sitzung liest participants ueber
  // participants_select_owner_or_staff und sieht damit GENAU EINE Zeile: die
  // eigene. Der Gegnername aus dem Join waere fuer jeden eingeloggten Spieler
  // null, also ueberall "Gegner". participants_select_public_board haengt an
  // der Rolle anon und gibt die Wettkaempfer-Namen frei — dieselben, die auf
  // dem Live-Board stehen. Siehe den Kommentar in lib/supabase/public.ts.
  const publicDb = await createPublicClient();

  // Taktung + Status. tournaments ist public-read, gilt also auch im Link-Modus.
  const { data: pacingRow } = await publicDb
    .from("tournaments")
    .select("status, match_duration_min, parallel_stations")
    .eq("id", tournamentId)
    .maybeSingle();

  const pacing: Pacing = {
    matchDurationMin: pacingRow?.match_duration_min ?? 12,
    parallelStations: pacingRow?.parallel_stations ?? 1,
  };
  const tournamentStatus: TournamentStatus = pacingRow?.status ?? "draft";

  // Alle Partien des Turniers — matches ist public-read, das trägt beide Modi.
  // Gebraucht werden sie ohnehin doppelt: für die eigene Liste UND für die
  // Warteschlange, die die fremden Partien davor zählt.
  const { data: rawMatches } = await publicDb
    .from("matches")
    .select(
      "id, round, slot, status, participant_a_id, participant_b_id, " +
        "score_a, score_b, live_score_a, live_score_b, live_ended_at, " +
        "a:participant_a_id(display_name), b:participant_b_id(display_name)",
    )
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true })
    .order("slot", { ascending: true })
    .overrideTypes<RawMatch[]>();

  const matchRows = rawMatches ?? [];

  const queueMatches: QueueMatch[] = matchRows.map((m) => ({
    id: m.id,
    round: m.round,
    slot: m.slot,
    status: m.status,
    participantAId: m.participant_a_id,
    participantBId: m.participant_b_id,
  }));

  // Mensch -> Wettkaempfer: coalesce(team_id, id), in beiden Modi gleich. Über
  // den Link liefert das die RPC jetzt selbst mit.
  const competitorId = participant.team_id ?? participant.id;
  let tokenReport: MyReport | null = null;

  if (viaToken && token) {
    // Bleibt allein wegen tokenReport: matches ist öffentlich lesbar,
    // match_reports aber nicht — dessen Policy will p.user_id = auth.uid(), und
    // im Link-Modus gibt es diese Sitzung nicht. Ohne den Definer-Weg würde ein
    // bereits gemeldeter Score nie geladen. Den Wettkaempfer muss die RPC nicht
    // mehr auflösen, den kennt participant.team_id.
    const { data: row } = await supabase
      .rpc("get_open_match_by_qr_token", { p_qr_token: token })
      .maybeSingle();
    if (row && row.report_score_a !== null && row.report_score_b !== null) {
      tokenReport = { score_a: row.report_score_a, score_b: row.report_score_b };
    }
  }

  const queue = queueStatus(queueMatches, competitorId, pacing);

  const myMatches: MyMatch[] = matchRows
    .filter(
      (m) =>
        m.participant_a_id === competitorId || m.participant_b_id === competitorId,
    )
    .map((m) => {
      const mySide: "a" | "b" =
        m.participant_a_id === competitorId ? "a" : "b";
      return {
        id: m.id,
        round: m.round,
        status: m.status,
        mySide,
        opponentName:
          (mySide === "a" ? m.b?.display_name : m.a?.display_name) ?? "Gegner",
        scoreA: m.score_a,
        scoreB: m.score_b,
        liveScoreA: m.live_score_a,
        liveScoreB: m.live_score_b,
        liveEndedAt: m.live_ended_at,
      };
    });

  // Die eigene Meldung zur nächsten offenen Partie. match_reports.reported_by
  // ist der WETTKAEMPFER — die Meldung eines Teammitglieds ist die Meldung des
  // Teams, und genau die soll den anderen im Team angezeigt werden.
  const openMatchId = queue.kind === "none" ? null : queue.matchId;
  let myReport: MyReport | null = tokenReport;

  if (!viaToken && openMatchId) {
    const { data } = await supabase
      .from("match_reports")
      .select("score_a, score_b")
      .eq("match_id", openMatchId)
      .eq("reported_by", competitorId)
      .maybeSingle();
    myReport = data ?? null;
  }

  // Team + Beitritts-Code. Beides hängt an auth.uid(), geht also nur mit
  // Sitzung. Nach Anmeldeschluss ruft /register notFound() — ohne diese Karte
  // gäbe es danach keinen Weg mehr an den Code.
  let team: TeamInfo | null = null;

  if (!viaToken && user) {
    const [{ data: reg }, { data: members }] = await Promise.all([
      supabase.rpc("get_my_registration", { p_tournament_id: tournamentId }),
      supabase.rpc("get_my_team", { p_tournament_id: tournamentId }),
    ]);
    const registration = reg?.[0];
    if (registration?.team_id && registration.team_name) {
      team = {
        name: registration.team_name,
        // Nach Anmeldeschluss ist der Code wertlos und nur noch ein Leck.
        joinCode:
          tournamentStatus === "registration" ? registration.join_code : null,
        members: (members ?? []).map((m) => ({
          id: m.member_id,
          name: m.member_name,
          isCaptain: m.member_is_captain,
          checkedIn: m.member_checked_in,
          isMe: m.member_is_me,
        })),
      };
    }
  }

  return (
    <MeClient
      participant={participant}
      tournamentId={tournamentId}
      viaToken={viaToken}
      matches={myMatches}
      queue={queue}
      openMatchId={openMatchId}
      myReport={myReport}
      team={team}
    />
  );
}
