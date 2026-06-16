import Link from "next/link";

import { cn } from "@/lib/utils";

type TournamentCard = {
  art: string;
  category: string;
  name: string;
  prize: string;
  teams: string;
  status: { label: string; live?: boolean };
};

const CARDS: TournamentCard[] = [
  {
    art: "VALORANT KEY ART",
    category: "Valorant · 5v5",
    name: "Next Level Masters",
    prize: "$250,000",
    teams: "16 / 16 teams",
    status: { label: "LIVE", live: true },
  },
  {
    art: "CS2 KEY ART",
    category: "Counter-Strike 2",
    name: "Velocity Open Cup",
    prize: "$50,000",
    teams: "48 / 64 teams",
    status: { label: "STARTS 2D" },
  },
  {
    art: "ROCKET LEAGUE ART",
    category: "Rocket League · 3v3",
    name: "Boost Rivals Series",
    prize: "$25,000",
    teams: "22 / 32 teams",
    status: { label: "STARTS 5D" },
  },
];

const ART_BG =
  "[background:repeating-linear-gradient(135deg,#161c27,#161c27_11px,#12161e_11px,#12161e_22px)]";

/** "Live & Upcoming" — three static tournament showcase cards linking to `/`. */
export function Tournaments() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 pb-24 pt-10 sm:px-10">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="m-0 font-display text-2xl font-bold uppercase tracking-wide sm:text-[26px]">
          Live &amp; Upcoming
        </h2>
        <Link
          href="/"
          className="font-display text-[13px] tracking-wider text-cyan transition-opacity hover:opacity-80"
        >
          ALL TOURNAMENTS →
        </Link>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.name}
            href="/"
            className="group overflow-hidden rounded-[14px] border border-line bg-surface transition-all hover:-translate-y-1 hover:border-lime/40"
          >
            <div
              className={cn(
                "relative flex h-[118px] items-center justify-center border-b border-white/[0.06]",
                ART_BG,
              )}
            >
              <span className="font-display text-[13px] tracking-[0.18em] text-[#3a4250]">
                {c.art}
              </span>
              {c.status.live ? (
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-live/40 bg-live/[0.16] px-2.5 py-1 font-display text-[11px] tracking-[0.12em] text-live">
                  <span className="size-1.5 animate-[nl-pulse_1.4s_infinite] rounded-full bg-live" />
                  {c.status.label}
                </span>
              ) : (
                <span className="absolute left-3 top-3 rounded-md border border-lime/35 bg-lime/[0.14] px-2.5 py-1 font-display text-[11px] tracking-[0.12em] text-lime">
                  {c.status.label}
                </span>
              )}
            </div>
            <div className="px-5 pb-5 pt-4">
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-cyan">
                {c.category}
              </div>
              <div className="mb-3.5 font-display text-lg font-semibold">
                {c.name}
              </div>
              <div className="flex justify-between text-[13px] text-fg-muted">
                <span>💰 {c.prize}</span>
                <span>{c.teams}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
