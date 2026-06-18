import "server-only";
import { notFound } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";

/**
 * Load a tournament only if it belongs to the caller's org; otherwise notFound().
 * `tournaments` is public-SELECT, so without this a staff member could view (not
 * write) another org's management pages by guessing the id. Pass any extra select
 * columns via `columns` (must include `org_id`).
 */
export async function requireOrgTournament<T extends { org_id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  orgId: string | null,
  columns: string,
): Promise<T> {
  const { data } = await supabase
    .from("tournaments")
    .select(columns)
    .eq("id", tournamentId)
    .maybeSingle<T>();
  if (!data || orgId == null || data.org_id !== orgId) notFound();
  return data;
}
