import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Magic-link / email-confirmation callback. Supabase redirects the user here
// with `token_hash` + `type`; we exchange them for a session (stored in cookies
// by the SSR server client) and forward to the organizer area.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const redirectTo = request.nextUrl.clone();
      redirectTo.pathname = "/organizer";
      redirectTo.search = "";
      return NextResponse.redirect(redirectTo);
    }
  }

  // Verification failed or required params missing.
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = "/login";
  redirectTo.search = "";
  redirectTo.searchParams.set("error", "auth");
  return NextResponse.redirect(redirectTo);
}
