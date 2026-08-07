"use server";

import { requireStaff, type ActionResult } from "@/lib/auth/staff";
import {
  hashPairingToken,
  newPairingToken,
  PAIRING_TTL_MS,
} from "@/lib/auth/device-pairing";
import { friendlyDbError } from "@/lib/db-errors";
import { createAdminClient } from "@/lib/supabase/admin";

export type PairingResult =
  | { ok: true; token: string; expiresAt: string }
  | { error: string };

/**
 * Mint a QR pairing token for the caller's OWN account. There is deliberately no
 * parameter naming a user: the token always points at whoever is signed in, so
 * this can never be used to hand out somebody else's session.
 */
export async function createPairing(): Promise<PairingResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { userId, orgId } = guard;
  if (!orgId) return { error: "Kein Org-Kontext." };

  const admin = createAdminClient();
  if (!admin) {
    return {
      error:
        "Geräte-Kopplung ist nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt).",
    };
  }

  const token = newPairingToken();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();

  const { error } = await admin.from("device_pairings").insert({
    token_hash: hashPairingToken(token),
    user_id: userId,
    org_id: orgId,
    expires_at: expiresAt,
  });
  if (error) {
    return { error: friendlyDbError(error, "QR konnte nicht erzeugt werden.") };
  }

  // The raw token leaves the server exactly once, straight into the QR.
  return { ok: true, token, expiresAt };
}

/** Sign one of the caller's own devices out. Scoping lives in the RPC. */
export async function revokeSession(sessionId: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;

  const { error } = await guard.supabase.rpc("revoke_session", {
    p_session_id: sessionId,
  });
  if (error) {
    return { error: friendlyDbError(error, "Gerät konnte nicht getrennt werden.") };
  }
  return { ok: true };
}
