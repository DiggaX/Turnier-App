"use server";

import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";
import { validBirthdate } from "@/lib/consent";

export async function updateParticipant(
  id: string,
  tournamentId: string,
  displayName: string,
  gamertag: string | null,
): Promise<ActionResult> {
  const guard = await requireStaff();
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
 */
export async function resetCheckIn(id: string, tournamentId: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { error, count } = await guard.supabase
    .from("participants")
    .update({ checked_in_at: null }, { count: "exact" })
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
 * Note this does NOT touch the bracket. An already generated bracket has to be
 * regenerated for the new entrant to get a match.
 */
export async function addParticipant(
  tournamentId: string,
  displayName: string,
  birthdate: string,
  gamertag: string | null,
  members: NewTeamMember[] = [],
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

  const isTeam = (tournament.team_size ?? 1) > 1;
  const roster = members
    .map((m) => ({
      name: m.name?.trim() ?? "",
      gamertag: m.gamertag?.trim() || null,
    }))
    .filter((m) => m.name.length > 0);

  if (isTeam && roster.length === 0) {
    return { error: "Bitte mindestens einen Spieler für das Team eintragen." };
  }

  const { data: participant, error: insErr } = await guard.supabase
    .from("participants")
    .insert({
      tournament_id: tournamentId,
      user_id: null,
      type: isTeam ? "team" : "solo",
      display_name: name,
      gamertag: gamertag?.trim() || null,
      birthdate: birthdate.trim(),
    })
    .select("id")
    .single();

  if (insErr || !participant) {
    return { error: friendlyDbError(insErr, "Teilnehmer konnte nicht angelegt werden.") };
  }

  // First name is the captain, same as the public registration writes it.
  if (isTeam) {
    const { error: memberErr } = await guard.supabase.from("team_members").insert(
      roster.map((m, i) => ({
        participant_id: participant.id,
        name: m.name,
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

  return { ok: true };
}

export async function removeParticipant(id: string, tournamentId: string): Promise<ActionResult> {
  const guard = await requireStaff();
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
