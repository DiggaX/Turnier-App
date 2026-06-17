"use server";

import { friendlyDbError, pgErrorCode } from "@/lib/db-errors";
import { requireOrganizerOrAdmin, type ActionResult } from "@/lib/auth/staff";

export async function createGame(name: string, teamSize: number): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;
  const n = name?.trim();
  if (!n) return { error: "Name ist erforderlich." };
  if (!Number.isInteger(teamSize) || teamSize < 1) return { error: "Teamgröße ≥ 1." };
  const { error } = await guard.supabase.from("games").insert({ name: n, team_size: teamSize });
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht angelegt werden.") };
  return { ok: true };
}

export async function updateGame(id: string, name: string, teamSize: number): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;
  const n = name?.trim();
  if (!n) return { error: "Name ist erforderlich." };
  if (!Number.isInteger(teamSize) || teamSize < 1) return { error: "Teamgröße ≥ 1." };
  const { error, count } = await guard.supabase
    .from("games")
    .update({ name: n, team_size: teamSize }, { count: "exact" })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht gespeichert werden.") };
  if ((count ?? 0) === 0) return { error: "Spiel wurde nicht gefunden oder bereits gelöscht." };
  return { ok: true };
}

/** Delete a game only when no tournament references it. */
export async function deleteGame(id: string): Promise<ActionResult> {
  const guard = await requireOrganizerOrAdmin();
  if ("error" in guard) return guard;
  const { count, error: countError } = await guard.supabase
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("game_id", id);
  if (countError) return { error: friendlyDbError(countError, "Prüfung fehlgeschlagen.") };
  if ((count ?? 0) > 0) {
    return { error: `Spiel wird von ${count} Turnier(en) genutzt und kann nicht gelöscht werden.` };
  }
  const { error } = await guard.supabase.from("games").delete().eq("id", id);
  if (error) {
    if (pgErrorCode(error) === "23503") {
      return { error: "Spiel wird noch von einem Turnier genutzt und kann nicht gelöscht werden." };
    }
    return { error: friendlyDbError(error, "Spiel konnte nicht gelöscht werden.") };
  }
  return { ok: true };
}
