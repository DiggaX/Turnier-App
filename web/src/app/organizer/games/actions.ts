"use server";

import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";

export async function createGame(name: string, teamSize: number): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const n = name?.trim();
  if (!n) return { error: "Name ist erforderlich." };
  if (!Number.isInteger(teamSize) || teamSize < 1) return { error: "Teamgröße ≥ 1." };
  const { error } = await guard.supabase.from("games").insert({ name: n, team_size: teamSize });
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht angelegt werden.") };
  return { ok: true };
}

export async function updateGame(id: string, name: string, teamSize: number): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const n = name?.trim();
  if (!n) return { error: "Name ist erforderlich." };
  if (!Number.isInteger(teamSize) || teamSize < 1) return { error: "Teamgröße ≥ 1." };
  const { error } = await guard.supabase.from("games").update({ name: n, team_size: teamSize }).eq("id", id);
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht gespeichert werden.") };
  return { ok: true };
}

/** Delete a game only when no tournament references it. */
export async function deleteGame(id: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { count } = await guard.supabase
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("game_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Spiel wird von ${count} Turnier(en) genutzt und kann nicht gelöscht werden.` };
  }
  const { error } = await guard.supabase.from("games").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht gelöscht werden.") };
  return { ok: true };
}
