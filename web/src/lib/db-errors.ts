/**
 * Friendly, user-facing German messages for Supabase/Postgres/Storage errors.
 *
 * The registration and consent flows are used by participants (often minors),
 * so raw DB errors must never reach the UI: their `message` can leak schema and
 * constraint names — e.g. `duplicate key value violates unique constraint
 * "participants_tournament_id_user_id_key"`. This mirrors the approach in
 * src/app/(auth)/login/actions.ts, which maps every failure to a fixed string.
 */

/** Postgres SQLSTATE code for a unique_violation. */
export const PG_UNIQUE_VIOLATION = "23505";

/** Safely read the Postgres SQLSTATE `code` from an unknown error value. */
export function pgErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** True when `error` is a Postgres unique_violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === PG_UNIQUE_VIOLATION;
}

/**
 * Translate a Supabase/Postgres/Storage error into a safe German message.
 *
 * `fallback` is returned for unrecognized errors (including Storage errors,
 * which carry no SQLSTATE code) so the raw `error.message` is never rendered.
 * Call sites with a more specific context — e.g. a known unique constraint —
 * should branch on {@link isUniqueViolation} before calling this.
 */
export function friendlyDbError(error: unknown, fallback: string): string {
  switch (pgErrorCode(error)) {
    case PG_UNIQUE_VIOLATION:
      return "Dieser Eintrag besteht bereits.";
    case "23502": // not_null_violation
    case "23503": // foreign_key_violation
    case "23514": // check_violation
      return "Einige Angaben sind ungültig. Bitte prüfe deine Eingaben.";
    case "42501": // insufficient_privilege (RLS)
      return "Diese Aktion ist nicht erlaubt.";
    default:
      return fallback;
  }
}
