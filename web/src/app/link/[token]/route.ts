import { type NextRequest, NextResponse } from "next/server";

import { hashPairingToken } from "@/lib/auth/device-pairing";
import { createAdminClient } from "@/lib/supabase/admin";

/** Send the phone to the login page with a reason instead of a blank 404. */
function fail(request: NextRequest, reason: "pairing" | "config") {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

/**
 * Redeem a pairing QR: turns a one-shot token into a real session on whatever
 * device scanned it.
 *
 * Deliberately a GET with no confirmation step — the scan itself is the intent,
 * and the token's two-minute life is what bounds the risk. Every reason for
 * refusal collapses into one response so a scanner cannot probe for valid
 * tokens.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;

  const admin = createAdminClient();
  if (!admin) return fail(request, "config");

  // Burn and validate in one statement. Doing this as select-then-update would
  // let two scans of the same code both pass the check and mint two sessions.
  const { data: pairing } = await admin
    .from("device_pairings")
    .update({
      claimed_at: new Date().toISOString(),
      claimed_user_agent: request.headers.get("user-agent"),
    })
    .eq("token_hash", hashPairingToken(token))
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id, user_id")
    .maybeSingle();

  if (!pairing) return fail(request, "pairing");

  const { data: user, error: userErr } = await admin.auth.admin.getUserById(
    pairing.user_id,
  );
  if (userErr || !user.user?.email) return fail(request, "pairing");

  // generateLink mints a one-time token without sending mail. Feeding its hash
  // through our own /auth/confirm keeps the exchange server-side, so the phone
  // never needs the code_verifier cookie that makes ordinary magic links
  // refuse to open on a second device.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.user.email,
  });
  if (linkErr || !link.properties?.hashed_token) {
    return fail(request, "pairing");
  }

  const confirm = request.nextUrl.clone();
  confirm.pathname = "/auth/confirm";
  confirm.search = "";
  confirm.searchParams.set("token_hash", link.properties.hashed_token);
  confirm.searchParams.set("type", "magiclink");
  // So the confirm step can record which session this pairing produced — that
  // link is the only way the device list can name a phone. Harmless if tampered
  // with: it only ever labels a row, and the update is scoped to the session
  // that was just created.
  confirm.searchParams.set("pairing", pairing.id);
  return NextResponse.redirect(confirm);
}
