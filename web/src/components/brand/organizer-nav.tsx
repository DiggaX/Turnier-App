"use client";

import { useState } from "react";
import Link from "next/link";

import { signOut } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/utils";

export type OrganizerNavProps = {
  className?: string;
  isAdmin?: boolean;
};

const LINKS = [
  { href: "/organizer", label: "Turniere", adminOnly: false },
  { href: "/organizer/games", label: "Spiele", adminOnly: false },
  { href: "/organizer/members", label: "Organisation", adminOnly: true },
] as const;

/**
 * Top bar for the organizer/staff area. Brand wordmark ("TURNIER-APP · ORGA"),
 * the section links, an admin-only "Organisation" entry, and a sign-out button
 * wired to the existing `signOut` server action.
 *
 * Collapses to a toggle menu below `sm`, mirroring the public <SiteNav>: laid
 * out in one row it measured 482px against a 375px phone, which put a
 * horizontal scrollbar on every organizer page — including the check-in screen
 * that is only ever used on a phone.
 */
export function OrganizerNav({ className, isAdmin }: OrganizerNavProps) {
  const [open, setOpen] = useState(false);
  const links = LINKS.filter((l) => !l.adminOnly || isAdmin);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl",
        className,
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-5 sm:px-9">
        <Link
          href="/organizer"
          onClick={() => setOpen(false)}
          className="min-w-0 truncate font-display text-base font-bold uppercase tracking-[0.08em] text-ink sm:text-lg"
        >
          Turnier<span className="text-lime">-App</span>
          <span className="ml-2 text-fg-dim">·</span>
          <span className="ml-2 text-cyan">Orga</span>
        </Link>

        {/* desktop links */}
        <div className="hidden items-center gap-1 sm:flex sm:gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-2 font-display text-xs font-medium uppercase tracking-wider text-fg-muted transition-colors hover:border-white/20 hover:text-ink"
            >
              Abmelden
            </button>
          </form>
        </div>

        {/* mobile toggle */}
        <button
          type="button"
          aria-label="Menü"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink sm:hidden"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <div className="border-t border-line bg-surface px-5 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <form action={signOut}>
              <button
                type="submit"
                className="mt-1 w-full rounded-lg border border-line px-4 py-2.5 text-center font-display text-xs font-bold uppercase tracking-wider text-fg-muted"
              >
                Abmelden
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
