import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { sessionIdFromAccessToken } from "@/lib/auth/device-pairing";
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE } from "@/lib/auth/recovery";
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

  // A password reset arrives through this same callback. Rather than carry a
  // `next` target (which would need an allowlist or become an open redirect),
  // the type itself is the signal: the mail template stamps `type=recovery` on
  // the token_hash link, and requestPasswordReset stamps it on the PKCE
  // `redirectTo`, so both link shapes are recognisable here.
  const isRecovery = type === "recovery";

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";
  redirectTo.pathname = verified
    ? isRecovery
      ? "/passwort"
      : "/organizer"
    : "/login";
  if (!verified) {
    redirectTo.searchParams.set("error", isRecovery ? "recovery" : "auth");
  }

  const response = NextResponse.redirect(redirectTo);

  // Lets /passwort tell "just reset their password" apart from "already signed
  // in", which is what makes the old-password prompt on the change form more
  // than decoration.
  if (verified && isRecovery) {
    response.cookies.set(RECOVERY_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: RECOVERY_COOKIE_MAX_AGE,
    });
  }

  return response;
}
