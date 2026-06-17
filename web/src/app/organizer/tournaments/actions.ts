"use server";

import { redirect } from "next/navigation";

import type { Database, TournamentFormat, TournamentMode } from "@/lib/database.types";
import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row: Database["public"]["Tables"]["tournaments"]["Insert"] = {
    name,
    game_id: input.gameId,
    format: input.format as TournamentFormat,
    mode: input.mode as TournamentMode,
    team_size: teamSize,
    status: "draft",
    starts_at: input.startsAt || null,
    created_by: user?.id ?? null,
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
