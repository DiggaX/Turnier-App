"use server";

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { orgSlug } from "@/lib/org/slug";

export type SignupState = { error?: string };

/**
 * Creates a minimal Supabase admin client using the service-role key.
 * Used only for cleanup (deleteUser) after a failed RPC, to avoid orphaned
 * auth users. The service-role key must be set as SUPABASE_SERVICE_ROLE_KEY.
 */
function createAdminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Successful signUp result. */
type SignUpOk = { ok: true; userId: string };
/** Failed signUp result. */
type SignUpFail = { ok: false; error: string };

/**
 * Signs up a new auth user. Returns `{ ok: true, userId }` on success or
 * `{ ok: false, error }` on failure.
 *
 * Validates email format locally before calling Supabase, so that a malformed
 * email (e.g. 'notanemail') does not produce a misleading "E-Mail evtl. schon
 * vergeben" message — that error is reserved for actual duplicates.
 */
async function signUp(email: string, password: string): Promise<SignUpOk | SignUpFail> {
  if (!email || password.length < 8) {
    return { ok: false, error: "E-Mail und ein Passwort (min. 8 Zeichen) erforderlich." };
  }
  // Basic format check — the <input type="email"> enforces this in browsers, but
  // direct API calls bypass that. Supabase's own error for an invalid format
  // would otherwise surface as "E-Mail evtl. schon vergeben." which is misleading.
  if (!email.includes("@")) {
    return { ok: false, error: "Ungültige E-Mail-Adresse." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return { ok: false, error: "Registrierung fehlgeschlagen. E-Mail evtl. schon vergeben." };
  }
  return { ok: true, userId: data.user.id };
}

/**
 * Deletes an orphaned auth user created by signUp when the subsequent RPC fails.
 * This is a best-effort cleanup — if it fails, the orphan remains but the user
 * receives a clear error and can retry with a different email.
 */
async function cleanupOrphanedUser(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // Cleanup is best-effort; a failed delete leaves a harmless orphaned auth
    // user with no profiles row. The user can retry with a different email.
  }
}

export async function signUpCreateOrg(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("orgName") ?? "").trim();
  if (!orgName) return { error: "Firmenname erforderlich." };
  const slug = orgSlug(orgName);
  if (!slug) return { error: "Firmenname ergibt keinen gültigen Namen." };

  const signUpResult = await signUp(email, password);
  if (!signUpResult.ok) return { error: signUpResult.error };
  const { userId } = signUpResult;

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_org", { p_name: orgName, p_slug: slug });
  if (error) {
    // The auth user was created but the RPC failed, leaving an orphaned auth
    // user with no profiles row. Clean it up so the user can retry with the
    // same email rather than seeing "E-Mail evtl. schon vergeben" on retry.
    await cleanupOrphanedUser(userId);
    return { error: "Organisation konnte nicht angelegt werden. Bitte versuche es erneut." };
  }
  redirect("/organizer");
}

export async function signUpAcceptInvite(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!code) return { error: "Einladungscode fehlt." };

  const signUpResult = await signUp(email, password);
  if (!signUpResult.ok) return { error: signUpResult.error };
  const { userId } = signUpResult;

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) {
    // Clean up the orphaned auth user so the invite can be retried with the
    // same email if the code was temporarily unavailable or the invite expired.
    await cleanupOrphanedUser(userId);
    return { error: "Einladung konnte nicht eingelöst werden (ungültig/abgelaufen?)." };
  }
  redirect("/organizer");
}
