"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
  /** Set after a magic link is requested so the UI can show "check your email". */
  magicLinkSent?: boolean;
};

/** Read the request origin (scheme + host) for building absolute redirect URLs. */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  // Fall back to forwarded headers (proxies) or the host header.
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export async function signInPassword(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Bitte E-Mail und Passwort eingeben." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen." };
  }

  // redirect throws — must be outside try/catch (none here) and after success.
  redirect("/organizer");
}

export async function signInMagicLink(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Bitte eine E-Mail-Adresse eingeben." };
  }

  const origin = await getOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      // This login is staff-only — new organisations come through /signup, which
      // also creates the profile + org. Left on the default, an unknown address
      // silently gets an auth user with no profile, and that account then logs in
      // fine but bounces straight back out of /organizer with nothing to show.
      shouldCreateUser: false,
    },
  });

  if (error) {
    return {
      error:
        "Magic Link konnte nicht gesendet werden. Gibt es für diese E-Mail schon ein Konto?",
    };
  }

  return { magicLinkSent: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
