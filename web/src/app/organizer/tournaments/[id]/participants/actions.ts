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
 * Note this does NOT touch the bracket. An already generated bracket has to be
 * regenerated for the new entrant to get a match.
 */
export async function addParticipant(
  tournamentId: string,
  displayName: string,
  birthdate: string,
  gamertag: string | null,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;

  const name = displayName?.trim();
  if (!name) return { error: "Anzeigename ist erforderlich." };
  if (!validBirthdate(birthdate?.trim() ?? "", new Date())) {
    return { error: "Bitte ein gültiges Geburtsdatum eingeben." };
  }

  // team_size decides solo vs team; team members stay empty and can be filled
  // in on the participant's page afterwards.
  const { data: tournament } = await guard.supabase
    .from("tournaments")
    .select("id, team_size")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return { error: "Turnier wurde nicht gefunden." };

  const { data: participant, error: insErr } = await guard.supabase
    .from("participants")
    .insert({
      tournament_id: tournamentId,
      user_id: null,
      type: (tournament.team_size ?? 1) > 1 ? "team" : "solo",
      display_name: name,
      gamertag: gamertag?.trim() || null,
      birthdate: birthdate.trim(),
    })
    .select("id")
    .single();

  if (insErr || !participant) {
    return { error: friendlyDbError(insErr, "Teilnehmer konnte nicht angelegt werden.") };
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
