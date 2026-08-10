import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasRecoveryCookie } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Passwort — Turnier-App" };

/**
 * Sets a new password, in one of two situations:
 *
 *   recovery cookie present → came from a reset mail; the old password cannot
 *                             be asked for, since it is what was forgotten.
 *   signed in, no cookie    → ordinary change; the old password is required.
 *   neither                 → nothing to change here, send them to request a link.
 *
 * That three-way check *is* the access control. `src/proxy.ts` only refreshes
 * the auth cookie — it has no route allowlist, so every page guards itself.
 */
export default async function PasswordPage() {
  const viaRecovery = await hasRecoveryCookie();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/passwort/vergessen");
  }

  const mode = viaRecovery ? "reset" : "change";

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12 sm:py-16">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_500px_at_50%_0%,rgba(31,209,227,0.09),transparent_60%)]"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="font-display text-xl font-bold uppercase tracking-[0.08em] text-ink">
            Turnier<span className="text-lime">-App</span>
          </div>
          <p className="mt-2 text-sm text-fg-muted">{user.email}</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h1 className="mb-5 font-display text-base font-bold uppercase tracking-wider text-ink">
            {mode === "reset" ? "Neues Passwort setzen" : "Passwort ändern"}
          </h1>
          <PasswordForm mode={mode} />
        </div>

        {mode === "change" && (
          <p className="mt-5 text-center text-sm text-fg-muted">
            Passwort vergessen?{" "}
            <Link
              href="/passwort/vergessen"
              className="text-cyan hover:text-lime"
            >
              Per E-Mail zurücksetzen
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
