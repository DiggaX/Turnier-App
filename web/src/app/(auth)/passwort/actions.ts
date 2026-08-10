"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasRecoveryCookie, RECOVERY_COOKIE } from "@/lib/auth/recovery";
import { getOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export type ForgotState = { error?: string; sent?: boolean };
export type SetPasswordState = { error?: string };

export async function requestPasswordReset(
  _prevState: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Bitte eine E-Mail-Adresse eingeben." };
  }

  const origin = await getOrigin();
  const supabase = await createClient();

  // `type=recovery` rides along so /auth/confirm can tell a reset apart from an
  // ordinary magic link. The customised mail template puts the same marker on
  // its token_hash link, so both link shapes land on the password page.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?type=recovery`,
  });

  // Deliberately ignore the result. Supabase does not error on an unknown
  // address, and surfacing anything different here would turn this form into an
  // oracle for which addresses have an account.
  return { sent: true };
}

export async function setPassword(
  _prevState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const passwordRepeat = String(formData.get("passwordRepeat") ?? "");
  const currentPassword = String(formData.get("currentPassword") ?? "");

  if (password.length < 8) {
    return { error: "Passwort braucht mindestens 8 Zeichen." };
  }
  if (password !== passwordRepeat) {
    return { error: "Die beiden Passwörter stimmen nicht überein." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "Sitzung abgelaufen. Bitte fordere den Link neu an." };
  }

  const viaRecovery = await hasRecoveryCookie();

  // Outside a recovery window, changing the password requires proving you know
  // the current one — otherwise an unlocked phone left on the desk at a
  // tournament is enough to take the account over.
  if (!viaRecovery) {
    if (!currentPassword) {
      return { error: "Bitte das aktuelle Passwort eingeben." };
    }
    // Must run BEFORE updateUser: this rotates the session cookies, and
    // updating first would leave updateUser working against a discarded one.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reauthError) {
      return { error: "Das aktuelle Passwort stimmt nicht." };
    }
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Passwort konnte nicht geändert werden." };
  }

  const store = await cookies();
  store.delete(RECOVERY_COOKIE);

  // redirect throws — must stay outside any try/catch and after success.
  redirect("/organizer");
}
