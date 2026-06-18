"use server";

import { redirect } from "next/navigation";

import type { Database, TournamentFormat, TournamentMode, TournamentStatus } from "@/lib/database.types";
import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";
import { nextStatus } from "@/lib/tournament/lifecycle";

const FORMATS: TournamentFormat[] = [
  "single_elim",
  "double_elim",
  "round_robin",
  "swiss",
  "groups_playoffs",
];
const MODES: TournamentMode[] = ["lan", "online", "hybrid"];

export type CreateTournamentInput = {
  name: string;
  gameId: string;
  format: string;
  mode: string;
  teamSize: number;
  startsAt: string | null;
};

/** Create a draft tournament owned by the caller, then redirect to its overview. */
export async function createTournament(
  input: CreateTournamentInput,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase, userId, orgId } = guard;
  if (!orgId) return { error: "Kein Org-Kontext — dein Account ist keiner Organisation zugeordnet." };

  const name = input.name?.trim();
  if (!name) return { error: "Name ist erforderlich." };
  if (!input.gameId) return { error: "Bitte ein Spiel wählen." };
  if (!FORMATS.includes(input.format as TournamentFormat)) {
    return { error: "Ungültiges Format." };
  }
  if (!MODES.includes(input.mode as TournamentMode)) {
    return { error: "Ungültiger Modus." };
  }
  const teamSize = Number(input.teamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    return { error: "Teamgröße muss mindestens 1 sein." };
  }

  const row: Database["public"]["Tables"]["tournaments"]["Insert"] = {
    name,
    game_id: input.gameId,
    format: input.format as TournamentFormat,
    mode: input.mode as TournamentMode,
    team_size: teamSize,
    status: "draft",
    starts_at: input.startsAt || null,
    created_by: userId,
    org_id: orgId,
  };

  const { data, error } = await supabase
    .from("tournaments")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    return { error: friendlyDbError(error, "Turnier konnte nicht angelegt werden.") };
  }
  redirect(`/organizer/tournaments/${data.id}`);
}

export type UpdateTournamentInput = {
  id: string;
  name: string;
  gameId: string;
  format: string;
  mode: string;
  teamSize: number;
  startsAt: string | null;
};

/** Update editable fields. game/format only change while no matches exist. */
export async function updateTournament(
  input: UpdateTournamentInput,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const name = input.name?.trim();
  if (!name) return { error: "Name ist erforderlich." };
  if (!input.gameId) return { error: "Bitte ein Spiel wählen." };
  if (!FORMATS.includes(input.format as TournamentFormat)) {
    return { error: "Ungültiges Format." };
  }
  if (!MODES.includes(input.mode as TournamentMode)) {
    return { error: "Ungültiger Modus." };
  }
  const teamSize = Number(input.teamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    return { error: "Teamgröße muss mindestens 1 sein." };
  }

  const { count: matchCount, error: matchCountErr } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", input.id);
  if (matchCountErr) {
    return { error: friendlyDbError(matchCountErr, "Turnier konnte nicht aktualisiert werden.") };
  }
  const hasMatches = (matchCount ?? 0) > 0;

  const patch: Database["public"]["Tables"]["tournaments"]["Update"] = {
    name,
    mode: input.mode as TournamentMode,
    team_size: teamSize,
    starts_at: input.startsAt || null,
  };
  if (!hasMatches) {
    patch.game_id = input.gameId;
    patch.format = input.format as TournamentFormat;
  }

  const { error, count } = await supabase
    .from("tournaments")
    .update(patch, { count: "exact" })
    .eq("id", input.id);
  if (error) {
    return { error: friendlyDbError(error, "Turnier konnte nicht gespeichert werden.") };
  }
  if ((count ?? 0) === 0) {
    return { error: "Turnier nicht gefunden oder keine Berechtigung." };
  }
  return { ok: true };
}

/** Move the tournament to its guided next status (draft->registration, running->finished). */
export async function advanceStatus(
  id: string,
  current: string,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const target = nextStatus(current as TournamentStatus);
  if (!target) return { error: "Kein gültiger nächster Status." };

  const { error, count } = await supabase
    .from("tournaments")
    .update({ status: target }, { count: "exact" })
    .eq("id", id)
    .eq("status", current as TournamentStatus); // optimistic guard: only if status hasn't moved
  if (error) {
    return { error: friendlyDbError(error, "Status konnte nicht geändert werden.") };
  }
  if ((count ?? 0) === 0) {
    return { error: "Status wurde bereits geändert." };
  }
  return { ok: true };
}

/** Delete a tournament (cascades matches/participants via FKs). */
export async function deleteTournament(id: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const { data: t } = await supabase
    .from("tournaments")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!t) {
    return { error: "Turnier nicht gefunden oder keine Berechtigung." };
  }
  if (t.status === "running" || t.status === "finished") {
    return { error: "Laufende oder beendete Turniere können nicht gelöscht werden." };
  }

  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) {
    return { error: friendlyDbError(error, "Turnier konnte nicht gelöscht werden.") };
  }
  return { ok: true };
}
