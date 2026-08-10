import { cookies } from "next/headers";

/**
 * Marks a session as "arrived here from a password-recovery mail". Set by
 * /auth/confirm, cleared once a new password is stored.
 *
 * Without it the "current password" check on the password page would be
 * decoration: anyone already holding a session could request the recovery
 * variant of the form and skip it. Short-lived on purpose — this is a recovery
 * window, not a second way to stay signed in.
 *
 * Kept out of the neighbouring `"use server"` action files, where every export
 * has to be an async function.
 */
export const RECOVERY_COOKIE = "pw_recovery";

/** 15 minutes — long enough to pick a password, short enough to not linger. */
export const RECOVERY_COOKIE_MAX_AGE = 900;

/**
 * Whether the visitor is inside a recovery window and may therefore set a new
 * password without producing the old one.
 */
export async function hasRecoveryCookie(): Promise<boolean> {
  const store = await cookies();
  return store.get(RECOVERY_COOKIE)?.value === "1";
}
