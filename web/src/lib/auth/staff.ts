import "server-only";

import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ActionResult = { ok: true } | { error: string };

/** Verify the caller is a signed-in staff member; return the client and orgId or an error. */
export async function requireStaff(): Promise<
  { supabase: Supabase; orgId: string | null } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    return { error: "Diese Aktion ist nicht erlaubt." };
  }
  return { supabase, orgId: profile.org_id as string | null };
}

/**
 * Guard for actions that require admin or organizer privileges.
 * Referees are excluded: they are match scorers and must not manage the
 * game catalog (add/rename/remove sport types).
 */
export async function requireOrganizerOrAdmin(): Promise<
  { supabase: Supabase } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer"].includes(profile.role)) {
    return { error: "Diese Aktion ist nicht erlaubt." };
  }
  return { supabase };
}
