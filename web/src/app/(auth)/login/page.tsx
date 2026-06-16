import type { Metadata } from "next";

import { MagicLinkForm, PasswordForm } from "./login-forms";

export const metadata: Metadata = {
  title: "Anmelden — Turnier-App",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4 sm:p-8">
      <PasswordForm />
      <MagicLinkForm />
    </main>
  );
}
