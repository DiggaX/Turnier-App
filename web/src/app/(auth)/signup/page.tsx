import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Registrieren — Turnier-App" };

export default async function SignupPage(props: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await props.searchParams;
  let invitePreview: { orgName: string; role: string } | null = null;
  let inviteInvalid = false;
  if (invite) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("peek_invite", { p_code: invite });
    const row = Array.isArray(data) ? data[0] : null;
    if (row) invitePreview = { orgName: row.org_name, role: row.member_role };
    else inviteInvalid = true;
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12 sm:py-16">
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="font-display text-xl font-bold uppercase tracking-[0.08em] text-ink">
            Turnier<span className="text-lime">-App</span>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {invitePreview
              ? `Du trittst „${invitePreview.orgName}" als ${invitePreview.role} bei.`
              : inviteInvalid
                ? "Diese Einladung ist ungültig oder abgelaufen."
                : "Registriere deine Organisation."}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <SignupForm invite={invite ?? null} canSubmit={!inviteInvalid} />
        </div>
        <p className="mt-5 text-center text-sm text-fg-muted">
          Schon ein Konto?{" "}
          <Link href="/login" className="text-cyan hover:text-lime">
            Anmelden
          </Link>
        </p>
      </div>
    </main>
  );
}
