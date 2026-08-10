/**
 * The auth identity a guest registration writes to `participants.user_id`.
 *
 * Rule: reuse an existing session ONLY when it is an anonymous one.
 *
 * - Anonymous session -> reuse. That is the same guest registering for a second
 *   tournament, and that session is also their only way back to `/t/[id]/me`
 *   (see supabase/migrations/20260710090000_participant_recovery_link.sql).
 *   Replacing it would lock them out of every earlier registration.
 * - No session -> sign in anonymously.
 * - Any other session (an organizer/staff account signed in on the same
 *   browser) -> refuse. Reusing it files the staff auth user as a participant:
 *   `unique(tournament_id, user_id)` then blocks that account from ever really
 *   registering, and every RLS policy keyed off `user_id` (participants,
 *   consents, check_ins, push_subscriptions, match_reports) sees a staff user
 *   where it expects a guest. Silently signing them out instead is no better —
 *   it drops the organizer out of their dashboard mid-event — so the caller
 *   gets a message telling them to use a private window.
 */

/** Only the shape this module needs, so tests can pass a plain object. */
interface GuestAuthClient {
  getSession(): Promise<{
    data: { session: { user: GuestUser } | null };
  }>;
  signInAnonymously(): Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
}

type GuestUser = { id: string; is_anonymous?: boolean };

export const STAFF_SESSION_MESSAGE =
  "Du bist mit einem Orga-Konto angemeldet. Melde dich ab oder öffne die Anmeldung in einem privaten Fenster, um dich als Gast anzumelden.";

/**
 * True only for the anonymous auth users this flow creates. `is_anonymous` is
 * optional on the Supabase user, so anything short of an explicit `true`
 * counts as a real account: an unrecognised session errs toward refusing
 * rather than toward writing the wrong `user_id`.
 */
export function isGuestUser(user: GuestUser | null | undefined): boolean {
  return user?.is_anonymous === true;
}

/** Resolve the guest auth user id to register under, per the rule above. */
export async function ensureGuestSession(
  auth: GuestAuthClient,
): Promise<string> {
  const {
    data: { session },
  } = await auth.getSession();

  if (session) {
    if (!isGuestUser(session.user)) throw new Error(STAFF_SESSION_MESSAGE);
    return session.user.id;
  }

  const { data, error } = await auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      "Anmeldung konnte nicht gestartet werden. Bitte versuche es erneut.",
    );
  }
  return data.user.id;
}
