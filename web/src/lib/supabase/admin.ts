import "server-only";

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Service-role client. Bypasses RLS entirely, so it must never be handed to a
 * client component and every call site has to authorise on its own first.
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY is absent rather than building a
 * client with `undefined` as the key: that client looks fine and then fails on
 * the first request with an opaque error, which is how the signup flow's
 * orphan cleanup came to be silently dead in production.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  return createSupabaseAdmin<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
