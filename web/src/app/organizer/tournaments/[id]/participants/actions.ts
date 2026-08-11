"use server";

import { friendlyDbError } from "@/lib/db-errors";
import {
  requireStaff,
  requireOrganizerOrAdmin,
  type ActionResult,
} from "@/lib/auth/staff";
import { validBirthdate } from "@/lib/consent";

import { moveInto, syncTeamReady } from "../team-sync";

export async function updateParticipant(
  id: string,
  tournamentId: string,
  displayName: string,
  gamertag: string | null,
): Promise<ActionResult> {
  // Umbenennen ist Datenpflege, nicht Tresenarbeit — und der Trigger auf
  // participants laesst einen Schiedsrichter ohnehin nur checked_in_at aendern.
  // Der Guard hier sorgt dafuer, dass er dafuer eine Meldung bekommt statt einer
  // rohen Datenbank-Ausnahme.
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;
  const name = displayName?.trim();
  if (!name) return { error: "Anzeigename ist erforderlich." };
  const { error, count } = await guard.supabase
    .from("participants")
    .update({ display_name: name, gamertag: gamertag?.trim() || null }, { count: "exact" })
    .eq("id", id)
    .eq("tournament_id", tournamentId);
  if (error) return { error: friendlyDbError(error, "Teilnehmer konnte nicht gespeichert werden.") };
  if ((count ?? 0) === 0) return { error: "Teilnehmer wurde nicht gefunden oder bereits gelöscht." };
  return { ok: true };
}

/**
 * Undo a check-in. Someone gets scanned by mistake, or a scan station is being
 * tested — without this the only way back was editing the row by hand, since
 * the check_in RPC is one-way.
 *
 * Der seed faellt mit: er ist die Startnummer IM Spielplan, und wer nicht
 * eingecheckt ist, steht nicht darin. Blieb er stehen, trug beim naechsten
 * Generieren ein Ausgecheckter dieselbe Nummer wie ein Antretender — genau die
 * Kollision, die live aufgefallen ist. Das gilt auch fuer den Weg ueber
 * setTeamReady(false): ein zurueckgenommenes Team ist aus dem Bracket raus und
 * darf seine Nummer nicht behalten.
 *
 * ⚠️ guard_participant_protected_fields laesst einen SCHIEDSRICHTER beim UPDATE
 * nur checked_in_at aendern (20260811110000). Solange der Trigger seed nicht
 * zusammen mit checked_in_at durchlaesst, faellt ein Reset durch den
 * Schiedsrichter auf einen bereits gesetzten Teilnehmer mit
 * "insufficient_privilege" — die Turnierleitung kommt durch.
 */
export async function resetCheckIn(id: string, tournamentId: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { error, count } = await guard.supabase
    .from("participants")
    .update({ checked_in_at: null, seed: null }, { count: "exact" })
    .eq("id", id)
    .eq("tournament_id", tournamentId);
  if (error) return { error: friendlyDbError(error, "Anwesenheit konnte nicht zurückgesetzt werden.") };
  if ((count ?? 0) === 0) return { error: "Teilnehmer wurde nicht gefunden." };
  return { ok: true };
}

/**
 * Check someone in from the attendance list. At the door a QR code can be
 * torn, smudged, or on a phone that is dead — with nothing left to scan, staff
 * needs a way in by hand. Counterpart to resetCheckIn.
 */
export async function manualCheckIn(id: string, tournamentId: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  // Confirm the participant belongs to this tournament first, so a stale row
  // gets a clean message instead of the RPC's. Authorization stays with the
  // RPC, which re-checks staff-of-org.
  const { data: participant } = await guard.supabase
    .from("participants")
    .select("id")
    .eq("id", id)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!participant) return { error: "Teilnehmer wurde nicht gefunden." };

  const { error } = await guard.supabase.rpc("check_in", {
    p_participant_id: id,
    p_method: "manual",
  });
  if (error) {
    return { error: friendlyDbError(error, "Check-in fehlgeschlagen.") };
  }
  return { ok: true };
}

/** One roster row for a team walk-in. Blank names are dropped. */
export type NewTeamMember = { name: string; gamertag?: string | null };

/**
 * Nachmeldung: add someone who turns up after registration closed.
 *
 * The public form at /t/[id]/register is bound to status='registration', so a
 * latecomer used to be unreachable — the only way in was resetting the whole
 * tournament's status by hand. Creates a walk-in without an account (no
 * recovery link, no photo consent — both belong to the person, not the orga)
 * and checks them in right away, since someone standing at the desk is by
 * definition present.
 *
 * On a team tournament `members` is the roster, first entry the captain, same
 * shape the public form writes. A team without players is not a team: for
 * team_size > 1 at least one name is required.
 *
 * `options.asSingle` ist der zweite Weg bei einem Teamturnier: EIN Mensch, kein
 * Team drumherum. Ohne ihn blieb dem Tresen nur „Team anlegen", und ein Kind
 * ohne Handy landete als 1-von-3-Geisterteam im Spielplan — genau so entstand
 * live „Team-Niki". Mit `options.teamId` zieht die Person direkt in ein
 * bestehendes Team ein, sonst steht sie als Restspieler da.
 *
 * Note this does NOT touch the bracket. An already generated bracket has to be
 * regenerated for the new entrant to get a match.
 */
export async function addParticipant(
  tournamentId: string,
  displayName: string,
  birthdate: string,
  gamertag: string | null,
  members: NewTeamMember[] = [],
  options?: { asSingle?: boolean; teamId?: string | null },
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;

  const name = displayName?.trim();
  if (!name) return { error: "Anzeigename ist erforderlich." };
  if (!validBirthdate(birthdate?.trim() ?? "", new Date())) {
    return { error: "Bitte ein gültiges Geburtsdatum eingeben." };
  }

  // team_size decides solo vs team, and whether a roster is required.
  const { data: tournament } = await guard.supabase
    .from("tournaments")
    .select("id, team_size")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { error: "Turnier wurde nicht gefunden." };

  const teamSize = tournament.team_size ?? 1;
  const isTeam = teamSize > 1;
  // Einzelspieler gibt es nur, wo es Teams gibt: bei team_size 1 ist jede
  // Nachmeldung ohnehin eine Person, und asSingle waere ein Widerspruch.
  const asSingle = isTeam && options?.asSingle === true;
  const teamEntry = isTeam && !asSingle;
  const teamId = asSingle ? options?.teamId?.trim() || null : null;

  const roster = members
    .map((m) => ({
      name: m.name?.trim() ?? "",
      gamertag: m.gamertag?.trim() || null,
    }))
    .filter((m) => m.name.length > 0);

  if (teamEntry && roster.length === 0) {
    return { error: "Bitte mindestens einen Spieler für das Team eintragen." };
  }

  // Das Zielteam VOR dem Anlegen pruefen — dieselbe Vorsicht wie in
  // assignFreeAgents: eine untergeschobene Id aus einem fremden Turnier waere
  // sonst ein stiller Team-Wechsel quer durch die Datenbank. Und wer erst den
  // Spieler anlegt und dann merkt, dass das Team nicht existiert, hat einen
  // Halbfertigen in der Liste stehen.
  //
  // Ob das Team leer ist, entscheidet ueber den Captain: ein Team ohne Captain
  // kann sich spaeter weder umbenennen noch aufloesen — zwei Captains sind aber
  // genauso falsch, deshalb nur beim ersten Mitglied.
  let teamIsEmpty = false;
  if (teamId) {
    const { data: team, error: teamErr } = await guard.supabase
      .from("participants")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("type", "team")
      .eq("id", teamId)
      .maybeSingle();
    if (teamErr) {
      return { error: friendlyDbError(teamErr, "Team konnte nicht geladen werden.") };
    }
    if (!team) return { error: "Unbekanntes Team in der Zuordnung." };

    const { data: mates, error: matesErr } = await guard.supabase
      .from("participants")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("team_id", teamId);
    if (matesErr) {
      return { error: friendlyDbError(matesErr, "Team konnte nicht geladen werden.") };
    }
    const taken = (mates ?? []).length;
    teamIsEmpty = taken === 0;
    // Ein volles Team nimmt keinen mehr auf. Die Auswahl blendet volle Teams
    // zwar aus, aber zwischen Seitenaufbau und Absenden kann ein anderer Tresen
    // denselben Platz vergeben haben — ohne diese Pruefung stuende im 3v3
    // lautlos ein Viertel im Team, und auffallen wuerde es erst im Spielplan.
    if (taken >= teamSize) {
      return {
        error:
          "Dieses Team ist bereits vollzählig — bitte ein anderes Team wählen " +
          "oder ohne Team anlegen.",
      };
    }
  }

  const { data: participant, error: insErr } = await guard.supabase
    .from("participants")
    .insert({
      tournament_id: tournamentId,
      user_id: null,
      // type entscheidet, wer antritt (§6): 'team' und 'solo' stehen im
      // Spielplan, 'player' ist ein Mensch darin. Der Guard-Trigger leitet den
      // Typ nur fuer Nicht-Staff ab — hier steht er trotzdem ausgeschrieben,
      // damit die Zeile fuer sich lesbar bleibt.
      type: teamEntry ? "team" : asSingle ? "player" : "solo",
      display_name: name,
      gamertag: gamertag?.trim() || null,
      birthdate: birthdate.trim(),
    })
    .select("id")
    .single();

  if (insErr || !participant) {
    return { error: friendlyDbError(insErr, "Teilnehmer konnte nicht angelegt werden.") };
  }

  // Die Mitglieder sind eigene participants-Zeilen (type='player', team_id ->
  // Team), nicht mehr team_members — sonst zeigt die Teilnehmerseite fuer eine
  // Nachmeldung ein leeres Team an. Ohne user_id und ohne Geburtsdatum: das
  // gehoert der Person und nicht dem Tresen. Der erste Name ist der Captain,
  // genau wie die oeffentliche Anmeldung es schreibt.
  if (teamEntry) {
    const { error: memberErr } = await guard.supabase.from("participants").insert(
      roster.map((m, i) => ({
        tournament_id: tournamentId,
        user_id: null,
        type: "player" as const,
        team_id: participant.id,
        display_name: m.name,
        gamertag: m.gamertag,
        is_captain: i === 0,
      })),
    );
    if (memberErr) {
      return {
        error:
          `${name} wurde angelegt, aber die Mitglieder konnten nicht ` +
          "gespeichert werden. Bitte auf der Teilnehmerseite ergänzen.",
      };
    }
  }

  // Separate step on purpose: check_in writes the audit row that says a human
  // waved this person through. A failure here leaves a usable participant, so
  // say what happened instead of pretending the whole thing failed.
  //
  // Und bewusst VOR der Team-Zuordnung: der Umzug schlaegt regelmaessig fehl —
  // guard_participant_protected_fields laesst einem Schiedsrichter jeden UPDATE
  // ausser checked_in_at durchfallen, Nachmelden darf er aber. Umgekehrt
  // sortiert bliebe eine angelegte, nicht eingecheckte Zeile zurueck, der Tresen
  // taete es fuer einen Fehlschlag und tippte die Person ein zweites Mal ein.
  const { error: checkInErr } = await guard.supabase.rpc("check_in", {
    p_participant_id: participant.id,
    p_method: "manual",
  });
  if (checkInErr) {
    return {
      error:
        `${name} wurde angelegt, aber der Check-in ist fehlgeschlagen. ` +
        "Bitte in der Teilnehmerliste manuell einchecken.",
    };
  }

  // Der Umzug laeuft ueber dieselbe Stelle wie die Restspieler-Zuordnung: wer
  // die Zusammensetzung eines Teams aendert, schuldet ihm auch den Nachzug
  // danach (siehe team-sync.ts). syncTeamReady zaehlt ANWESENDE Mitglieder,
  // steht also richtig hinter Check-in und Umzug: davor faende es den gerade
  // Angelegten nie und ein durch ihn vollzaehlig gewordenes Team bliebe mit
  // checked_in_at NULL zurueck — generateBracket uebergeht es dann wortlos.
  if (teamId) {
    const moved = await moveInto(
      guard.supabase,
      tournamentId,
      teamId,
      [participant.id],
      teamIsEmpty,
    );
    if (moved) {
      return {
        error:
          `${name} wurde angelegt und eingecheckt, aber die Team-Zuordnung ist ` +
          "fehlgeschlagen. Bitte im Restspieler-Panel zuordnen.",
      };
    }

    // Dieselbe Ansage wie beim Umzug darueber, aus demselben Grund: der Mensch
    // STEHT — angelegt, eingecheckt, zugeordnet, nur der Nachzug fehlt. Der rohe
    // Datenbankfehler verschwieg das, und der Tresen tippte die Person ein
    // zweites Mal ein.
    const ready = await syncTeamReady(guard.supabase, tournamentId, teamId, teamSize);
    if (ready) {
      return {
        error:
          `${name} wurde angelegt, eingecheckt und dem Team zugeordnet, aber ` +
          "die Spielbereitschaft ließ sich nicht nachziehen. Bitte das Team " +
          "ggf. auf der Teams-Seite spielbereit melden.",
      };
    }
  }

  return { ok: true };
}

export async function removeParticipant(id: string, tournamentId: string): Promise<ActionResult> {
  // Loeschen ist seit 20260811110000 der Turnierleitung vorbehalten. Ohne diesen
  // Guard liefe die Anfrage bis Postgres und kaeme als "Teilnehmer wurde nicht
  // gefunden" zurueck — die Policy filtert die Zeile weg, statt zu widersprechen.
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;
  const { error, count } = await guard.supabase
    .from("participants")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("tournament_id", tournamentId);
  if (error) return { error: friendlyDbError(error, "Teilnehmer konnte nicht entfernt werden.") };
  if ((count ?? 0) === 0) return { error: "Teilnehmer wurde nicht gefunden." };
  return { ok: true };
}
