import type { Metadata } from "next";

import { SiteNav } from "@/components/brand/site-nav";

import { Bracket } from "./_components/bracket";
import { Footer } from "./_components/footer";
import { Hero } from "./_components/hero";
import { Tournaments } from "./_components/tournaments";

export const metadata: Metadata = {
  title: "Next Level Esports — Learning",
  description:
    "Competitive tournaments, real-time brackets, and instant payouts. Enter the Next Level.",
};

/**
 * `/learn` — the "Next Level Esports" showcase/landing page. Static, on-brand
 * content with call-to-action links into the real app. Ported from the
 * provided design (see design-refs/next-level.extracted.html).
 */
export default function LearnPage() {
  return (
    <>
      <SiteNav />

      <main className="relative overflow-x-hidden">
        {/* ambient glow */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 [background:radial-gradient(900px_600px_at_82%_-5%,rgba(31,209,227,0.14),transparent_60%),radial-gradient(800px_600px_at_8%_8%,rgba(197,247,46,0.10),transparent_55%),radial-gradient(700px_500px_at_50%_110%,rgba(31,209,227,0.08),transparent_60%)]"
        />
        {/* grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:radial-gradient(ellipse_90%_70%_at_50%_30%,#000_40%,transparent_100%)]"
        />

        <div className="relative z-10">
          <Hero />
          <Tournaments />
          <Bracket />
        </div>
      </main>

      <Footer />
    </>
  );
}
