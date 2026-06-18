import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";

/**
 * Sessionless **anon** Supabase client for PUBLIC pages (home, tournament detail,
 * live board). It deliberately ignores the visitor's auth cookies so reads always
 * run as the `anon` role.
 *
 * Why: `anon` is column-granted only the safe participant fields
 * (id, tournament_id, display_name), and the `participants_select_public_board`
 * RLS policy is scoped `to anon`. A logged-in visitor's session (role
 * `authenticated`) would instead read participants via the owner-or-staff policy —
 * which returns only their own row — so public pages would show 0 counts / missing
 * names. Reading these public pages as `anon` keeps names + counts working for
 * everyone WITHOUT ever exposing sensitive columns (birthdate, qr_token) to a
 * logged-in session. Use the session client (`@/lib/supabase/server`) only on
 * pages that need the viewer's identity (`/me`, organizer area).
 */
export function createPublicClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* read-only public client — never reads or writes the session */
        },
      },
    },
  );
}
