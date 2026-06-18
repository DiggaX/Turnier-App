import "server-only";

import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ActionResult = { ok: true } | { error: string };

/** Verify the caller is a signed-in staff member; return the client, userId, and orgId or an error. */
export async function requireStaff(): Promise<
  { supabase: Supabase; userId: string; orgId: string | null } | { error: string }
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
  return { supabase, userId: user.id, orgId: profile.org_id as string | null };
}

/**
 * Guard for actions that require admin-only privileges.
 * Only the org admin may manage members, invite codes, and roles.
 * Returns supabase client and orgId on success.
 */
export async function requireAdmin(): Promise<
  { supabase: Supabase; orgId: string } | { error: string }
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
  if (!profile || profile.role !== "admin") {
    return { error: "Diese Aktion ist nicht erlaubt." };
  }
  if (!profile.org_id) {
    return { error: "Kein Org-Kontext." };
  }
  return { supabase, orgId: profile.org_id as string };
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
