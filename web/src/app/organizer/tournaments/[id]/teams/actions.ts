"use server";

import { friendlyDbError, isUniqueViolation } from "@/lib/db-errors";
import { requireOrganizerOrAdmin, type ActionResult } from "@/lib/auth/staff";
import { manualCheckIn, resetCheckIn } from "../participants/actions";
import { syncTeamReady } from "../team-sync";
import type { Assignment } from "./assign";

/**
 * Die Orga schreibt hier direkt auf participants statt ueber die Spieler-RPCs
 * (create_team, join_team, …). Die haengen alle an assert_team_phase und gaeben
 * nach dem Anmeldeschluss auf — genau dann, wenn am Tresen noch drei Kinder
 * ohne Team stehen. Staff darf per RLS auf participants schreiben, und der
 * Schutz-Trigger laesst is_staff() durch.
 *
 * Was der Trigger auch fuer Staff durchsetzt: team_id muss auf eine Zeile mit
 * type='team' im SELBEN Turnier zeigen. Deshalb wird unten geprueft, bevor
 * geschrieben wird — sonst kaeme die Datenbank-Ausnahme roh in der Oberflaeche an.
 */

/** Ohne I, O, 0 und 1 — der Code wird abgelesen und weitergesagt (wie in create_team). */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Eine leere Mannschaft anlegen, in die die Orga anschliessend Spieler zieht.
 *
 * Der Beitritts-Code entsteht hier genauso wie in create_team: einfuegen und die
 * Kollision abfangen, statt vorher zu suchen und zu hoffen. Ohne Code waere das
 * Team fuer einen Nachzuegler, der sich selbst anmeldet, unerreichbar.
 */
export async function createTeam(
  tournamentId: string,
  name: string,
): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;

  const teamName = name?.trim();
  if (!teamName) return { error: "Bitte einen Teamnamen angeben." };

  for (let attempt = 0; attempt < 20; attempt++) {
    const { error } = await guard.supabase.from("participants").insert({
      tournament_id: tournamentId,
      user_id: null,
      type: "team",
      display_name: teamName,
      join_code: newJoinCode(),
    });
    if (!error) return { ok: true };
    // Nur der Beitritts-Code kollidiert hier — Teamnamen duerfen doppelt sein.
    if (!isUniqueViolation(error)) {
      return { error: friendlyDbError(error, "Team konnte nicht angelegt werden.") };
    }
  }
  return { error: "Team konnte nicht angelegt werden. Bitte noch einmal versuchen." };
}

export async function renameTeam(
  tournamentId: string,
  teamId: string,
  name: string,
): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;

  const teamName = name?.trim();
  if (!teamName) return { error: "Bitte einen Teamnamen angeben." };

  // type='team' im Filter, damit eine verirrte Spieler-Id nicht als Team
  // umbenannt wird.
  const { error, count } = await guard.supabase
    .from("participants")
    .update({ display_name: teamName }, { count: "exact" })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .eq("type", "team");

  if (error) return { error: friendlyDbError(error, "Team konnte nicht umbenannt werden.") };
  if ((count ?? 0) === 0) return { error: "Team wurde nicht gefunden." };
  return { ok: true };
}

/**
 * Team aufloesen. Die Mitglieder bleiben bestehen und werden zu Spielern ohne
 * Team — das erledigt der Fremdschluessel (on delete set null), nicht dieser
 * Code. Sie zu loeschen waere falsch: es sind Menschen mit eigener Anmeldung
 * und eigener Fotoerlaubnis.
 */
export async function disbandTeam(
  tournamentId: string,
  teamId: string,
): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;

  // Auf einen 23503 zu warten waere hier ein Fehler: matches.participant_a_id,
  // _b_id und winner_id stehen auf ON DELETE SET NULL (live geprueft), nicht auf
  // restrict. Das Loeschen eines Teams aus einem erzeugten Spielplan laeuft also
  // fehlerfrei durch und leert stillschweigend dessen Slots — eine fertige
  // Partie verliert dabei sogar ihren Sieger. Deshalb vorher fragen.
  const { data: inBracket, error: matchErr } = await guard.supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .or(`participant_a_id.eq.${teamId},participant_b_id.eq.${teamId}`)
    .limit(1)
    .maybeSingle();
  if (matchErr) {
    return { error: friendlyDbError(matchErr, "Team konnte nicht aufgelöst werden.") };
  }
  if (inBracket) {
    return {
      error:
        "Dieses Team steht bereits im Spielplan und kann nicht aufgelöst " +
        "werden. Erst das Bracket neu erzeugen.",
    };
  }

  const { error, count } = await guard.supabase
    .from("participants")
    .delete({ count: "exact" })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .eq("type", "team");

  if (error) return { error: friendlyDbError(error, "Team konnte nicht aufgelöst werden.") };
  if ((count ?? 0) === 0) return { error: "Team wurde nicht gefunden." };
  return { ok: true };
}

/** Genau ein Captain pro Team: erst alle im Team zuruecksetzen, dann einen setzen. */
export async function setCaptain(
  tournamentId: string,
  teamId: string,
  playerId: string,
): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;

  const { data: member } = await guard.supabase
    .from("participants")
    .select("id")
    .eq("id", playerId)
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!member) {
    return {
      error:
        "Dieser Spieler gehört nicht zu diesem Team. Bitte erst die Zuordnung speichern.",
    };
  }

  const { error: clearErr } = await guard.supabase
    .from("participants")
    .update({ is_captain: false })
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId);
  if (clearErr) {
    return { error: friendlyDbError(clearErr, "Captain konnte nicht gesetzt werden.") };
  }

  const { error, count } = await guard.supabase
    .from("participants")
    .update({ is_captain: true }, { count: "exact" })
    .eq("id", playerId)
    .eq("tournament_id", tournamentId);
  if (error) return { error: friendlyDbError(error, "Captain konnte nicht gesetzt werden.") };
  if ((count ?? 0) === 0) return { error: "Spieler wurde nicht gefunden." };
  return { ok: true };
}

/**
 * "Spielbereit" ist checked_in_at auf der TEAM-Zeile — dieselbe Spalte, aus der
 * die Bracket-Generierung ihre Teilnehmer zieht. Deshalb ist das hier kein
 * eigener Mechanismus, sondern der vorhandene manuelle Check-in.
 */
export async function setTeamReady(
  tournamentId: string,
  teamId: string,
  ready: boolean,
): Promise<ActionResult> {
  return ready
    ? manualCheckIn(teamId, tournamentId)
    : resetCheckIn(teamId, tournamentId);
}

/**
 * Die gezogene Zuordnung festschreiben. `changes` enthaelt nur die Spieler,
 * deren Team sich tatsaechlich geaendert hat (siehe pendingChanges in assign.ts).
 *
 * is_captain faellt bei jedem Wechsel mit — sonst haette das Zielteam nach dem
 * Verschieben eines Captains zwei davon. Genau deshalb duerfen unveraenderte
 * Zeilen nicht mitgeschickt werden.
 */
export async function saveAssignments(
  tournamentId: string,
  changes: Assignment[],
): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;

  if (changes.length === 0) return { ok: true };
  if (new Set(changes.map((c) => c.playerId)).size !== changes.length) {
    return { error: "Ein Spieler kommt in der Zuordnung doppelt vor." };
  }

  // Ein Blick auf das ganze Turnier statt zwei Abfragen: daraus ergibt sich
  // sowohl "ist das ein Spieler dieses Turniers" als auch "ist das ein Team
  // dieses Turniers". Beides muss stimmen, bevor geschrieben wird — der
  // Schutz-Trigger wuerde sonst mit einer rohen DB-Meldung abbrechen.
  const { data: rows, error: loadErr } = await guard.supabase
    .from("participants")
    .select("id, type")
    .eq("tournament_id", tournamentId);
  if (loadErr) {
    return { error: friendlyDbError(loadErr, "Teilnehmer konnten nicht geladen werden.") };
  }

  const byId = new Map((rows ?? []).map((r) => [r.id, r.type]));
  for (const change of changes) {
    if (byId.get(change.playerId) !== "player") {
      return { error: "Unbekannter Spieler in der Zuordnung." };
    }
    if (change.teamId !== null && byId.get(change.teamId) !== "team") {
      return { error: "Unbekanntes Team in der Zuordnung." };
    }
  }

  // Zeile fuer Zeile, jede auf ihr Turnier eingegrenzt — wie saveSeeds. Es sind
  // die Spieler eines Turniers, keine Grossenordnung, die einen Bulk-Weg braucht.
  for (const change of changes) {
    const { error, count } = await guard.supabase
      .from("participants")
      .update({ team_id: change.teamId, is_captain: false }, { count: "exact" })
      .eq("id", change.playerId)
      .eq("tournament_id", tournamentId)
      .eq("type", "player");
    if (error) {
      return { error: friendlyDbError(error, "Zuordnung konnte nicht gespeichert werden.") };
    }
    if ((count ?? 0) === 0) return { error: "Spieler wurde nicht gefunden." };
  }

  // Ein Team, das erst durch diese Zuordnung vollzaehlig wird, bleibt sonst mit
  // checked_in_at NULL stehen: der Trigger sync_team_ready feuert nur bei einer
  // geaenderten ANWESENHEIT, hier aendert sich nur das Team. generateBracket
  // uebergeht das Team dann stillschweigend — genau der Mechanismus, an dem das
  // laufende Turnier zerbrochen ist. Der Weg ueber die Restspieler-Zuordnung
  // zieht das schon lange nach; dieser hier tat es nicht.
  //
  // Nur die ZIELE, und jedes nur einmal. Ein verlassenes Team wird bewusst
  // nicht zurueckgenommen: syncTeamReady meldet ausschliesslich spielbereit,
  // und eine von Hand gesetzte Freigabe darf keine Aktion wieder einkassieren.
  const targetIds = [
    ...new Set(
      changes.map((c) => c.teamId).filter((teamId): teamId is string => teamId !== null),
    ),
  ];
  if (targetIds.length > 0) {
    const { data: tournament, error: tErr } = await guard.supabase
      .from("tournaments")
      .select("team_size")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tErr) {
      return { error: friendlyDbError(tErr, "Turnier konnte nicht geladen werden.") };
    }
    const teamSize = tournament?.team_size ?? 1;
    for (const teamId of targetIds) {
      const ready = await syncTeamReady(guard.supabase, tournamentId, teamId, teamSize);
      if (ready) return ready;
    }
  }

  return { ok: true };
}
