import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Magic-link / email-confirmation callback. The email link points at Supabase's
// own /auth/v1/verify endpoint, which verifies the token and then forwards here
// with one of two shapes:
//   ?code=...              PKCE flow — the default for @supabase/ssr, whose
//                          tokens carry a `pkce_` prefix. Needs an exchange
//                          against the code_verifier cookie set at request time,
//                          so the link only works in the browser that asked for it.
//   ?token_hash=..&type=.. only when the email template is customised to point
//                          straight at this route and skip /auth/v1/verify.
// Handling just one of them silently drops every valid login the other way round.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let verified = false;
  if (code || (token_hash && type)) {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: token_hash! });
    verified = !error;
  }

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";
  redirectTo.pathname = verified ? "/organizer" : "/login";
  if (!verified) redirectTo.searchParams.set("error", "auth");
  return NextResponse.redirect(redirectTo);
}
