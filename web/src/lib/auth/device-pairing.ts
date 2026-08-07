import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * How long a pairing QR stays redeemable. Whoever photographs the code within
 * this window gets a staff session, so it is deliberately shorter than the time
 * it takes to walk off with a picture and act on it. Redemption also burns the
 * token, so this is the ceiling, not the usual lifetime.
 */
export const PAIRING_TTL_MS = 2 * 60 * 1000;

/** A fresh pairing token. 32 random bytes, url-safe. */
export function newPairingToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What goes in the table. Only the hash is stored, so a dump of
 * device_pairings cannot be replayed into a session.
 */
export function hashPairingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The session id a Supabase access token belongs to, read from its payload.
 *
 * Not verified here on purpose: the token was just minted by verifyOtp in the
 * same request, so it is ours. The value is only used to label and revoke a
 * device — never to grant anything.
 */
export function sessionIdFromAccessToken(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { session_id?: unknown };
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}
