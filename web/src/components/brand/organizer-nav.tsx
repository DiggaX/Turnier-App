import Link from "next/link";

import { signOut } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/utils";

export type OrganizerNavProps = {
  className?: string;
};

/**
 * Top bar for the organizer/staff area. Brand wordmark ("TURNIER-APP · ORGA"),
 * a "Turniere" link back to the dashboard, and a sign-out button wired to the
 * existing `signOut` server action. Sticky, dark, lime-accented — mirrors the
 * public <SiteNav> styling for the staff surface.
 */
export function OrganizerNav({ className }: OrganizerNavProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl",
        className,
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-9">
        {/* brand */}
        <Link
          href="/organizer"
          className="font-display text-base font-bold uppercase tracking-[0.08em] text-ink sm:text-lg"
        >
          Turnier<span className="text-lime">-App</span>
          <span className="ml-2 text-fg-dim">·</span>
          <span className="ml-2 text-cyan">Orga</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/organizer"
            className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:text-ink"
          >
            Turniere
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-2 font-display text-xs font-medium uppercase tracking-wider text-fg-muted transition-colors hover:border-white/20 hover:text-ink"
            >
              Abmelden
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}
