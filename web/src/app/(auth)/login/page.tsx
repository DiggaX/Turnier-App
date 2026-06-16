import type { Metadata } from "next";

import { MagicLinkForm, PasswordForm } from "./login-forms";

export const metadata: Metadata = {
  title: "Anmelden — Turnier-App",
};

export default function LoginPage() {
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
            <span className="ml-2 text-fg-dim">·</span>
            <span className="ml-2 text-cyan">Orga</span>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            Nur für Organizer, Admins &amp; Schiris.
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <PasswordForm />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
              Oder
            </span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <MagicLinkForm />
        </div>
      </div>
    </main>
  );
}
