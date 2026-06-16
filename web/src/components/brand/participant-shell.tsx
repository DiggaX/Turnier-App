import type { ReactNode } from "react";

import { SiteNav } from "@/components/brand/site-nav";
import { cn } from "@/lib/utils";

export type ParticipantShellProps = {
  /** Tiny uppercase Chakra-Petch route/eyebrow line above the heading. */
  eyebrow?: string;
  /** Page heading (rendered in Chakra Petch, uppercase, tracked). */
  heading: string;
  /** Optional muted sub-line under the heading. */
  subheading?: ReactNode;
  /** Accent tint for the ambient glow. */
  glow?: "cyan" | "lime";
  children: ReactNode;
  className?: string;
};

const GLOW: Record<NonNullable<ParticipantShellProps["glow"]>, string> = {
  cyan: "[background:radial-gradient(700px_500px_at_50%_-5%,rgba(31,209,227,0.10),transparent_60%)]",
  lime: "[background:radial-gradient(700px_500px_at_50%_-5%,rgba(197,247,46,0.09),transparent_60%)]",
};

/**
 * Shared dark page frame for participant-facing flows (register, status,
 * check-in). Renders the public <SiteNav>, an ambient radial glow, and a
 * centered narrow column with a Chakra-Petch heading block — mirroring the
 * home/detail pages. Presentational only; owns no data or routing.
 */
export function ParticipantShell({
  eyebrow,
  heading,
  subheading,
  glow = "cyan",
  children,
  className,
}: ParticipantShellProps) {
  return (
    <>
      <SiteNav />

      <main className="relative flex-1 overflow-hidden">
        {/* ambient glow */}
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-0", GLOW[glow])}
        />

        <div
          className={cn(
            "relative mx-auto w-full max-w-xl px-5 pb-20 pt-10 sm:px-8 sm:pt-12",
            className,
          )}
        >
          {/* heading block */}
          <div className="mb-7">
            {eyebrow && (
              <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
                {eyebrow}
              </div>
            )}
            <h1 className="font-display text-2xl font-bold uppercase leading-[1.05] tracking-tight text-ink sm:text-3xl">
              {heading}
            </h1>
            {subheading && (
              <p className="mt-2 text-sm text-fg-muted">{subheading}</p>
            )}
          </div>

          {children}
        </div>
      </main>
    </>
  );
}

/** Small uppercase Chakra-Petch section label, e.g. "SPIELER", "EINWILLIGUNG". */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim",
        className,
      )}
    >
      {children}
    </div>
  );
}
