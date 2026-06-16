import { MatchCard, type MatchCardProps } from "./match-card";

const LIME = "from-lime to-[#7da80f]";
const CYAN = "from-cyan to-[#0d8a96]";

const QUARTERFINALS: MatchCardProps[] = [
  {
    a: { name: "NOVA", tag: "NV", chip: LIME, seed: 1, score: 13 },
    b: { name: "GLITCH", tag: "GLX", chip: CYAN, seed: 8, score: 6 },
    win: "a",
  },
  {
    a: { name: "TITANS", tag: "TTN", chip: CYAN, seed: 4, score: 11 },
    b: { name: "RAVENS", tag: "RVN", chip: LIME, seed: 5, score: 13 },
    win: "b",
  },
  {
    a: { name: "ONYX", tag: "ONX", chip: LIME, seed: 3, score: 13 },
    b: { name: "EMBER", tag: "EMB", chip: CYAN, seed: 6, score: 9 },
    win: "a",
  },
  {
    a: { name: "VOLT", tag: "VLT", chip: CYAN, seed: 7, score: 8 },
    b: { name: "PHOENIX", tag: "PHX", chip: LIME, seed: 2, score: 13 },
    win: "b",
  },
];

const SEMIFINALS: MatchCardProps[] = [
  {
    a: { name: "NOVA", tag: "NV", chip: LIME, seed: 1, score: 13 },
    b: { name: "RAVENS", tag: "RVN", chip: LIME, seed: 5, score: 10 },
    win: "a",
  },
  {
    a: { name: "ONYX", tag: "ONX", chip: LIME, seed: 3, score: 11 },
    b: { name: "PHOENIX", tag: "PHX", chip: CYAN, seed: 2, score: 13 },
    win: "b",
  },
];

const FINAL: MatchCardProps = {
  a: { name: "NOVA", tag: "NV", chip: LIME, seed: 1, score: 13 },
  b: { name: "PHOENIX", tag: "PHX", chip: CYAN, seed: 2, score: 9 },
  live: true,
};

/** A vertical connector pair joining two upstream matches into one downstream. */
function Connector() {
  return (
    <div className="hidden w-[54px] flex-col lg:flex">
      <div className="flex flex-1 flex-col py-[25%]">
        <div className="flex-1 border-r-2 border-t-2 border-[#232c39]" />
        <div className="flex-1 border-b-2 border-r-2 border-[#232c39]" />
      </div>
    </div>
  );
}

/**
 * Static "Next Level Masters" single-elimination bracket showcase:
 * Quarterfinals → Semifinals → Grand Final → Champion.
 */
export function Bracket() {
  return (
    <section
      id="bracket"
      className="mx-auto max-w-[1340px] scroll-mt-20 px-6 pb-20 pt-4 sm:px-10"
    >
      <div className="mb-2 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <div className="mb-2 flex items-center gap-3 text-[13px] text-fg-muted">
            <span>Tournaments</span>
            <span className="text-[#3a4250]">/</span>
            <span className="text-cyan">Bracket</span>
          </div>
          <h2 className="m-0 mb-3 font-display text-3xl font-bold uppercase leading-tight tracking-tight">
            Next Level Masters
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[13px] text-fg-muted">
            <span className="font-display tracking-wider text-cyan">
              VALORANT · 5v5
            </span>
            <span>💰 $250,000</span>
            <span>Single Elimination</span>
            <span>8 Teams</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-live/40 bg-live/[0.13] px-4 py-2.5 font-display text-xs tracking-[0.18em] text-live">
          <span className="size-2 animate-[nl-pulse_1.4s_infinite] rounded-full bg-live shadow-[0_0_10px_#ff3b5c]" />
          GRAND FINAL LIVE
        </div>
      </div>

      {/* round labels (desktop) */}
      <div className="mb-3.5 mt-8 hidden font-display text-xs uppercase tracking-[0.18em] text-fg-muted lg:flex">
        <div className="flex-1 text-center">Quarterfinals</div>
        <div className="w-[54px]" />
        <div className="flex-1 text-center">Semifinals</div>
        <div className="w-[54px]" />
        <div className="flex-1 text-center text-cyan">Grand Final</div>
        <div className="w-[54px]" />
        <div className="w-[210px] text-center text-lime">Champion</div>
      </div>

      {/* bracket grid */}
      <div className="flex flex-col gap-6 lg:h-[580px] lg:flex-row lg:items-stretch lg:gap-0">
        {/* Quarterfinals */}
        <div className="flex flex-1 flex-col gap-3 lg:gap-0">
          <RoundLabel>Quarterfinals</RoundLabel>
          {QUARTERFINALS.map((m, i) => (
            <div key={i} className="flex flex-1 items-center">
              <MatchCard {...m} />
            </div>
          ))}
        </div>

        <Connector />

        {/* Semifinals */}
        <div className="flex flex-1 flex-col gap-3 lg:gap-0">
          <RoundLabel>Semifinals</RoundLabel>
          {SEMIFINALS.map((m, i) => (
            <div key={i} className="flex flex-1 items-center">
              <MatchCard {...m} />
            </div>
          ))}
        </div>

        <Connector />

        {/* Grand Final */}
        <div className="flex flex-1 flex-col justify-center">
          <RoundLabel className="text-cyan">Grand Final</RoundLabel>
          <div className="flex items-center">
            <MatchCard {...FINAL} />
          </div>
        </div>

        {/* connector → champion */}
        <div className="hidden w-[54px] items-center lg:flex">
          <div className="h-0.5 w-full bg-gradient-to-r from-[#232c39] to-lime" />
        </div>

        {/* Champion */}
        <div className="flex flex-col justify-center lg:w-[210px]">
          <RoundLabel className="text-lime">Champion</RoundLabel>
          <div className="relative rounded-[14px] border border-lime/40 bg-gradient-to-b from-lime/[0.12] to-cyan/[0.06] px-5 py-6 text-center shadow-[0_0_40px_rgba(197,247,46,0.18)]">
            <div className="mb-3.5 font-display text-[11px] tracking-[0.25em] text-lime">
              CHAMPION
            </div>
            <div className="mx-auto mb-3.5 flex size-[72px] items-center justify-center rounded-2xl bg-gradient-to-br from-lime to-[#7da80f] font-display text-[26px] font-bold text-bg shadow-[0_0_30px_rgba(197,247,46,0.5)]">
              NV
            </div>
            <div className="font-display text-[22px] font-bold">NOVA</div>
            <div className="mt-1 text-xs tracking-wider text-fg-muted">
              🏆 In progress
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Per-column round label, shown only on mobile (desktop uses the header row). */
function RoundLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mb-2 font-display text-[11px] uppercase tracking-[0.18em] text-fg-muted lg:hidden ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
