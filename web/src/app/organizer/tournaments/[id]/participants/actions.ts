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
