import Link from "next/link";

import { SiteNav } from "@/components/brand/site-nav";
import { createPublicClient } from "@/lib/supabase/public";

export default async function Home() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("organizations")
    .select("name, slug")
    .order("name", { ascending: true });

  const organizations = data ?? [];

  return (
    <>
      <SiteNav />

      <main className="relative overflow-hidden">
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_460px_at_80%_-5%,rgba(31,209,227,0.13),transparent_60%),radial-gradient(600px_460px_at_5%_5%,rgba(197,247,46,0.09),transparent_55%)]"
        />

        <div className="relative mx-auto max-w-[1080px] px-5 pb-20 pt-14 sm:px-9">
          {/* hero */}
          <h1 className="font-display text-4xl font-bold uppercase leading-[0.98] tracking-tight text-ink sm:text-6xl">
            Finde dein <span className="text-lime">Turnier</span>
          </h1>
          <p className="mt-4 max-w-[480px] text-base text-fg-muted sm:text-lg">
            Wähle eine Organisation und entdecke ihre Turniere. Anmelden,
            einchecken, live mitfiebern — alles vom Handy.
          </p>

          {/* org directory */}
          <div className="mt-10 flex flex-col gap-3.5">
            {organizations.length === 0 && (
              <div className="rounded-2xl border border-line bg-surface p-8 text-center text-fg-muted">
                Aktuell sind keine Organisationen registriert.
              </div>
            )}

            {organizations.map((org) => (
              <Link
                key={org.slug}
                href={`/o/${org.slug}`}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-cyan/40 sm:p-[18px_22px]"
              >
                <span className="font-display text-xl font-semibold text-ink">
                  {org.name}
                </span>
                <span className="font-display text-xs font-bold uppercase tracking-wider text-fg-muted transition-colors hover:text-ink">
                  Turniere ansehen →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
