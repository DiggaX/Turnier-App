"use server";

import { requireStaff, type ActionResult } from "@/lib/auth/staff";
import { friendlyDbError } from "@/lib/db-errors";

import { PERSON_TYPES } from "../participants/participant-types";

/** Spieler, die in ein bestehendes Team einziehen. */
export type TeamFill = { teamId: string; playerIds: string[] };

/** Ein Team, das aus Restspielern neu gebildet wird. */
export type NewTeam = { name: string; playerIds: string[] };

/**
 * Die von der Orga bestaetigte Restspieler-Zuordnung ausfuehren.
 *
 * Bewusst dumm: die Vorschlagslogik steckt in free-agents.ts und im Panel, hier
 * wird nur noch geschrieben, was die Orga vor sich gesehen hat. Kein
 * Auto-Ausfuellen, kein „der Rest kommt schon irgendwo hin" — wer nicht in der
 * Liste steht, bleibt ohne Team.
 *
 * Hinweis fuer den Schutz-Trigger, der team_id/is_captain gegen direkte PATCHes
 * sperren soll: dieser Weg hier ist ein direkter UPDATE durch Staff. Wenn der
 * Trigger ihn mitsperrt, braucht es dafuer eine SECURITY-DEFINER-Funktion
 * (Staff-of-Org geprueft) — die Aktion faellt sonst mit der DB-Meldung auf die
 * Nase, statt still danebenzugreifen.
 */
export async function assignFreeAgents(
  tournamentId: string,
  fills: TeamFill[],
  newTeams: NewTeam[],
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("team_size")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) {
    return { error: friendlyDbError(tErr, "Turnier konnte nicht geladen werden.") };
  }
  if (!tournament) return { error: "Turnier wurde nicht gefunden." };
  const teamSize = tournament.team_size ?? 1;

  const cleanFills = fills.filter((f) => f.playerIds.length > 0);
  const cleanNew = newTeams
    .map((t) => ({ name: t.name.trim(), playerIds: t.playerIds }))
    .filter((t) => t.playerIds.length > 0);

  if (cleanFills.length === 0 && cleanNew.length === 0) {
    return { error: "Keine Zuordnung ausgewählt." };
  }
  if (cleanNew.some((t) => t.name.length === 0)) {
    return { error: "Jedes neue Team braucht einen Namen." };
  }

  const playerIds = [
    ...cleanFills.flatMap((f) => f.playerIds),
    ...cleanNew.flatMap((t) => t.playerIds),
  ];
  if (new Set(playerIds).size !== playerIds.length) {
    return { error: "Ein Spieler wurde doppelt zugeordnet." };
  }

  // Jede Id gegen dieses Turnier pruefen, bevor irgendetwas geschrieben wird:
  // eine untergeschobene Id aus einem anderen Turnier waere sonst ein stiller
  // Team-Wechsel quer durch die Datenbank.
  const { data: people, error: peopleErr } = await supabase
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .in("type", PERSON_TYPES)
    .in("id", playerIds);
  if (peopleErr) {
    return { error: friendlyDbError(peopleErr, "Spieler konnten nicht geladen werden.") };
  }
  if ((people ?? []).length !== playerIds.length) {
    return { error: "Unbekannter Spieler in der Zuordnung." };
  }

  if (cleanFills.length > 0) {
    const teamIds = cleanFills.map((f) => f.teamId);
    const { data: teams, error: teamsErr } = await supabase
      .from("participants")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("type", "team")
      .in("id", teamIds);
    if (teamsErr) {
      return { error: friendlyDbError(teamsErr, "Teams konnten nicht geladen werden.") };
    }
    if ((teams ?? []).length !== new Set(teamIds).size) {
      return { error: "Unbekanntes Team in der Zuordnung." };
    }
  }

  // Neue Teams zuerst anlegen — ohne join_code: diese Teams stellt die Orga
  // zusammen, es soll sich niemand nachtraeglich per Code hineinschreiben.
  for (const team of cleanNew) {
    const { data: created, error: createErr } = await supabase
      .from("participants")
      .insert({
        tournament_id: tournamentId,
        user_id: null,
        type: "team",
        display_name: team.name,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return { error: friendlyDbError(createErr, `Team „${team.name}" konnte nicht angelegt werden.`) };
    }
    const result = await moveInto(supabase, tournamentId, created.id, team.playerIds, true);
    if (result) return result;
    const ready = await syncTeamReady(supabase, tournamentId, created.id, teamSize);
    if (ready) return ready;
  }

  for (const fill of cleanFills) {
    const result = await moveInto(supabase, tournamentId, fill.teamId, fill.playerIds, false);
    if (result) return result;
    const ready = await syncTeamReady(supabase, tournamentId, fill.teamId, teamSize);
    if (ready) return ready;
  }

  return { ok: true };
}

/**
 * Ein vollzaehliges Team spielbereit melden.
 *
 * Der Trigger sync_team_ready macht das sonst von selbst — er feuert aber nur,
 * wenn sich die ANWESENHEIT einer Person aendert, und hier aendert sich nur ihr
 * Team. Ohne diesen Nachzug bleibt ein Team, das gerade aus lauter anwesenden
 * Restspielern entstanden ist, mit checked_in_at NULL zurueck: generateBracket
 * uebergeht es, und auf der Bracket-Seite steht nirgends, warum. Dieselbe
 * Bedingung wie im Trigger, damit beide Wege dasselbe bedeuten.
 */
async function syncTeamReady(
  supabase: Supabase,
  tournamentId: string,
  teamId: string,
  teamSize: number,
): Promise<ActionResult | null> {
  if (teamSize < 2) return null;

  const { data: members, error: memberErr } = await supabase
    .from("participants")
    .select("id, checked_in_at")
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId);
  if (memberErr) {
    return { error: friendlyDbError(memberErr, "Spielbereitschaft konnte nicht geprüft werden.") };
  }
  const present = (members ?? []).filter((m) => m.checked_in_at !== null).length;
  if (present < teamSize) return null;

  // `is("checked_in_at", null)` wie im Trigger: eine von Hand gesetzte
  // Freigabe (Team tritt unvollzaehlig an) bekommt keinen neuen Zeitstempel.
  const { error } = await supabase
    .from("participants")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .is("checked_in_at", null);
  if (error) {
    return { error: friendlyDbError(error, "Team konnte nicht spielbereit gemeldet werden.") };
  }
  return null;
}

type Supabase = Extract<Awaited<ReturnType<typeof requireStaff>>, { supabase: unknown }>["supabase"];

/**
 * Spieler in ein Team umhaengen. `withCaptain` macht den ersten zum Captain —
 * ein frisch gebildetes Team hat sonst keinen, und ohne Captain kann es sich
 * spaeter nicht selbst umbenennen oder aufloesen.
 */
async function moveInto(
  supabase: Supabase,
  tournamentId: string,
  teamId: string,
  playerIds: string[],
  withCaptain: boolean,
): Promise<ActionResult | null> {
  const { error } = await supabase
    .from("participants")
    .update({ team_id: teamId })
    .eq("tournament_id", tournamentId)
    .in("id", playerIds);
  if (error) {
    return { error: friendlyDbError(error, "Zuordnung konnte nicht gespeichert werden.") };
  }
  if (withCaptain) {
    const { error: capErr } = await supabase
      .from("participants")
      .update({ is_captain: true })
      .eq("tournament_id", tournamentId)
      .eq("id", playerIds[0]);
    if (capErr) {
      return { error: friendlyDbError(capErr, "Captain konnte nicht gesetzt werden.") };
    }
  }
  return null;
}
