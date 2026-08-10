import type { Metadata } from "next";
import Link from "next/link";

import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen — Turnier-App",
};

export default function ForgotPasswordPage() {
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
          <p className="mt-2 text-sm text-fg-muted">
            Wir schicken dir einen Link, mit dem du ein neues Passwort setzen
            kannst.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h1 className="mb-5 font-display text-base font-bold uppercase tracking-wider text-ink">
            Passwort zurücksetzen
          </h1>
          <ForgotForm />
        </div>

        <p className="mt-5 text-center text-sm text-fg-muted">
          Doch wieder eingefallen?{" "}
          <Link href="/login" className="text-cyan hover:text-lime">
            Anmelden
          </Link>
        </p>
      </div>
    </main>
  );
}
