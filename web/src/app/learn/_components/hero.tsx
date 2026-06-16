import Link from "next/link";

const STATS = [
  { value: "$250K", label: "Prize Pool" },
  { value: "12,480", label: "Players" },
  { value: "64", label: "Pro Teams" },
] as const;

/**
 * Landing hero: eyebrow, "Enter the Next Level" headline, subtitle, CTAs,
 * stat row, and the floating live-match preview card. CTAs link into the real
 * app (`/`).
 */
export function Hero() {
  return (
    <section className="mx-auto grid max-w-[1280px] items-center gap-14 px-6 pb-10 pt-16 lg:grid-cols-[1.05fr_0.95fr] sm:px-10">
      {/* left column */}
      <div>
        <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-cyan/35 bg-cyan/[0.07] px-4 py-1.5 font-display text-xs tracking-[0.18em] text-cyan">
          <span className="size-2 animate-[nl-pulse_1.6s_infinite] rounded-full bg-lime shadow-[0_0_10px_#c5f72e]" />
          SEASON 4 · REGISTRATION OPEN
        </div>

        <h1 className="m-0 mb-5 font-display text-5xl font-bold uppercase leading-[0.96] tracking-tight sm:text-7xl">
          Enter the
          <br />
          <span className="text-lime [text-shadow:0_0_38px_rgba(197,247,46,0.45)]">
            Next
          </span>{" "}
          <span className="text-cyan [text-shadow:0_0_38px_rgba(31,209,227,0.45)]">
            Level
          </span>
        </h1>

        <p className="m-0 mb-8 max-w-[470px] text-base leading-relaxed text-fg-muted sm:text-lg">
          Competitive tournaments, real-time brackets, and instant payouts.
          Build your squad, climb the ladder, and prove you belong at the top.
        </p>

        <div className="mb-11 flex flex-wrap items-center gap-3.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-[10px] bg-lime px-7 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-bg shadow-[0_0_28px_rgba(197,247,46,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(197,247,46,0.7)]"
          >
            Join a Tournament →
          </Link>
          <Link
            href="#bracket"
            className="flex items-center gap-2.5 rounded-[10px] border border-cyan/40 bg-cyan/[0.05] px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/[0.13]"
          >
            ▶ Live Bracket
          </Link>
        </div>

        <div className="flex gap-10">
          {STATS.map((stat, i) => (
            <div key={stat.label} className="flex items-center gap-10">
              {i > 0 && <div className="h-10 w-px bg-white/10" />}
              <div>
                <div className="font-display text-3xl font-bold text-ink">
                  {stat.value}
                </div>
                <div className="mt-0.5 text-xs uppercase tracking-[0.12em] text-fg-muted">
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* right column — floating live-match preview */}
      <div className="relative animate-[nl-float_7s_ease-in-out_infinite]">
        <div className="absolute -inset-0.5 rounded-[20px] bg-gradient-to-br from-lime/50 to-cyan/50 opacity-50 blur-[22px]" />
        <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-b from-[#11161f] to-[#0b0f16] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 animate-[nl-scan_5s_linear_infinite] bg-gradient-to-b from-cyan/[0.12] to-transparent" />

          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="size-2 animate-[nl-pulse_1.4s_infinite] rounded-full bg-live shadow-[0_0_10px_#ff3b5c]" />
              <span className="font-display text-xs tracking-[0.18em] text-live">
                LIVE · GRAND FINAL
              </span>
            </div>
            <span className="text-xs text-fg-muted">👁 8,214</span>
          </div>

          <div className="flex items-center justify-between px-6 py-8">
            <div className="flex-1 text-center">
              <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-lime to-[#7da80f] font-display text-[22px] font-bold text-bg">
                NV
              </div>
              <div className="font-display text-[15px] font-semibold">NOVA</div>
              <div className="text-[11px] tracking-wider text-fg-muted">
                SEED #1
              </div>
            </div>
            <div className="px-3.5 text-center">
              <div className="font-display text-[42px] font-bold tracking-wide">
                <span className="text-lime">13</span>
                <span className="text-[#3a4250]"> : </span>
                <span className="text-ink">9</span>
              </div>
              <div className="mt-0.5 text-[11px] tracking-[0.18em] text-fg-muted">
                MAP 3 · ASCENT
              </div>
            </div>
            <div className="flex-1 text-center">
              <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan to-[#0d8a96] font-display text-[22px] font-bold text-bg">
                PHX
              </div>
              <div className="font-display text-[15px] font-semibold">
                PHOENIX
              </div>
              <div className="text-[11px] tracking-wider text-fg-muted">
                SEED #2
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.07] bg-white/[0.025] px-5 py-3.5">
            <span className="text-xs text-fg-muted">
              Next Level Masters · Valorant
            </span>
            <Link
              href="#bracket"
              className="font-display text-xs tracking-wider text-cyan transition-opacity hover:opacity-80"
            >
              VIEW BRACKET →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
