import type { Metadata } from "next";
import Link from "next/link";

import { MagicLinkForm, PasswordForm } from "./login-forms";

export const metadata: Metadata = {
  title: "Anmelden — Turnier-App",
};

/** Reasons another route bounced the visitor here, keyed by ?error=. */
const LOGIN_ERRORS: Record<string, string> = {
  auth: "Der Anmeldelink ist ungültig oder abgelaufen. Fordere unten einen neuen an — und öffne ihn im selben Browser, in dem du ihn anforderst.",
  noaccess:
    "Anmeldung hat geklappt, aber dieses Konto gehört zu keiner Organisation. Lass dich von deinem Admin einladen oder registriere unten eine neue Firma.",
  pairing:
    "Dieser QR-Code ist abgelaufen oder wurde schon benutzt. Lass am angemeldeten Gerät einen neuen erzeugen.",
  config:
    "Die Geräte-Kopplung ist auf diesem Server nicht konfiguriert. Melde dich unten normal an.",
};

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await props.searchParams;

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
          {LOGIN_ERRORS[error ?? ""] && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/35 bg-destructive/[0.08] px-4 py-3 text-sm text-destructive"
            >
              {LOGIN_ERRORS[error ?? ""]}
            </p>
          )}

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
        <p className="mt-5 text-center text-sm text-fg-muted">
          Neue Firma?{" "}
          <Link href="/signup" className="text-cyan hover:text-lime">
            Registrieren
          </Link>
        </p>
      </div>
    </main>
  );
}
