import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { sessionIdFromAccessToken } from "@/lib/auth/device-pairing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Note which session a QR pairing produced, so the device list can name that
 * phone. auth.sessions only ever records our own server as the user agent, so
 * without this every device would read the same.
 *
 * Best-effort: a failure here costs a label, never the login.
 */
async function tagPairedSession(pairingId: string, accessToken: string) {
  const sessionId = sessionIdFromAccessToken(accessToken);
  if (!sessionId) return;

  const admin = createAdminClient();
  if (!admin) return;

  // Only ever fills in a blank on a redeemed row: a guessed pairing id cannot
  // re-point one that is already tagged.
  await admin
    .from("device_pairings")
    .update({ session_id: sessionId })
    .eq("id", pairingId)
    .not("claimed_at", "is", null)
    .is("session_id", null);
}

// Magic-link / email-confirmation callback. The email link points at Supabase's
// own /auth/v1/verify endpoint, which verifies the token and then forwards here
// with one of two shapes:
//   ?code=...              PKCE flow — the default for @supabase/ssr, whose
//                          tokens carry a `pkce_` prefix. Needs an exchange
//                          against the code_verifier cookie set at request time,
//                          so the link only works in the browser that asked for it.
//   ?token_hash=..&type=.. an admin-generated token, which is how device pairing
//                          signs in a second device, and what a customised email
//                          template would send.
// Handling just one of them silently drops every valid login the other way round.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const pairingId = searchParams.get("pairing");

  let verified = false;
  if (code || (token_hash && type)) {
    const supabase = await createClient();
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: token_hash! });
    verified = !error;

    if (verified && pairingId && data.session?.access_token) {
      await tagPairedSession(pairingId, data.session.access_token);
    }
  }

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";
  redirectTo.pathname = verified ? "/organizer" : "/login";
  if (!verified) redirectTo.searchParams.set("error", "auth");
  return NextResponse.redirect(redirectTo);
}
