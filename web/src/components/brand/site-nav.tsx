"use client";

import { useState } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Turniere" },
  { href: "/learn", label: "Learning" },
] as const;

export type SiteNavProps = {
  className?: string;
};

/**
 * Public top navigation. Brand wordmark (lime accent), primary links, and an
 * "Anmelden" CTA. Collapses to a toggle menu on small screens.
 */
export function SiteNav({ className }: SiteNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl",
        className,
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1080px] items-center justify-between px-5 sm:px-9">
        {/* brand */}
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="font-display text-lg font-bold uppercase tracking-[0.08em] text-ink"
        >
          Turnier<span className="text-lime">-App</span>
        </Link>

        {/* desktop links */}
        <div className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-2 rounded-lg bg-lime px-4 py-2 font-display text-xs font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90"
          >
            Anmelden
          </Link>
        </div>

        {/* mobile toggle */}
        <button
          type="button"
          aria-label="Menü"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex size-9 items-center justify-center rounded-lg border border-line text-ink sm:hidden"
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

      {/* mobile menu */}
      {open && (
        <div className="border-t border-line bg-surface px-5 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-lg bg-lime px-4 py-2.5 text-center font-display text-xs font-bold uppercase tracking-wider text-bg"
            >
              Anmelden
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
