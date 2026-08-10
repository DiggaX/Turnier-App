"use server";

import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";

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
