import "server-only";
import { notFound } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";

/**
 * Load a tournament only if it belongs to the caller's org; otherwise notFound().
 *
 * `tournaments` rows are visible to authenticated non-staff users via the
 * `OR NOT is_staff()` branch of the RLS policy, so without this guard a staff
 * member could visit another org's management pages by guessing the id.
 *
 * @param supabase  - Authenticated Supabase client (from `createClient()`).
 * @param tournamentId - The tournament UUID from the URL.
 * @param orgId  - The caller's `profile.org_id`. When `null` (e.g. an admin
 *   user whose account has not yet been assigned to an organisation) this
 *   function calls `notFound()`, blocking all pages. This is intentional:
 *   staff without an org assignment cannot manage any tournament. If future
 *   requirements add a super-admin bypass, pass a `role` parameter and skip
 *   the org check when `role === 'admin'`.
 * @param columns - PostgREST column selector (e.g. `'id, name, org_id'`).
 *   **Must include `org_id`** — a runtime assertion enforces this. Omitting
 *   `org_id` would make `data.org_id` undefined at runtime, causing every
 *   call to return 404 silently.
 */
export async function requireOrgTournament<T extends { org_id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  orgId: string | null,
  columns: string,
): Promise<T> {
  if (!columns.includes("org_id")) {
    throw new Error("requireOrgTournament: columns must include org_id");
  }
  const { data } = await supabase
    .from("tournaments")
    .select(columns)
    .eq("id", tournamentId)
    .maybeSingle<T>();
  if (!data || orgId == null || data.org_id !== orgId) notFound();
  return data;
}
