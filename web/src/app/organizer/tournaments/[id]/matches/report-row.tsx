import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { ConfirmForm } from "./confirm-form";

/** A single player report in match (a/b) terms. */
export type ReportView = {
  /** Reporter's display name, if resolvable. */
  byName: string | null;
  scoreA: number;
  scoreB: number;
};

/** One match enriched for the referee view. */
export type MatchRowView = {
  id: string;
  round: number;
  slot: number;
  status: "pending" | "live" | "done" | "bye";
  aName: string | null;
  bName: string | null;
  winnerId: string | null;
  participantAId: string | null;
  participantBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Player reports for this match, in match (a/b) terms. */
  reports: ReportView[];
};

/** Both reports present and identical → the agreed (a,b) score, else null. */
function agreedScore(
  reports: ReportView[],
): { a: number; b: number } | null {
  if (reports.length < 2) return null;
  const [first] = reports;
  const allAgree = reports.every(
    (r) => r.scoreA === first.scoreA && r.scoreB === first.scoreB,
  );
  return allAgree ? { a: first.scoreA, b: first.scoreB } : null;
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-display text-[10px] font-medium uppercase tracking-[0.12em]",
        tone === "ok" && "bg-lime/15 text-lime",
        tone === "warn" && "bg-live/15 text-live",
        tone === "muted" && "bg-white/[0.04] text-fg-dim",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Referee row for one match: the two sides, any submitted player reports, an
 * agreement / dispute / waiting badge, and either the final result (when done)
 * or the <ConfirmForm> (prefilled with the agreed score when both reports
 * agree). Matches with an empty slot (TBD) render without a form. Presentational
 * apart from the embedded client form.
 */
export function ReportRow({ match }: { match: MatchRowView }) {
  const aLabel = match.aName ?? "TBD";
  const bLabel = match.bName ?? "TBD";
  const bothSlotsFilled =
    match.participantAId != null && match.participantBId != null;

  const agreed = agreedScore(match.reports);

  let badge: ReactNode = null;
  if (match.status !== "done") {
    if (match.reports.length === 0) {
      badge = <StatusBadge tone="muted">Warten auf Meldungen</StatusBadge>;
    } else if (agreed) {
      badge = (
        <StatusBadge tone="ok">
          ✓ Einig: {agreed.a}:{agreed.b}
        </StatusBadge>
      );
    } else if (match.reports.length >= 2) {
      badge = <StatusBadge tone="warn">⚠ Abweichung</StatusBadge>;
    } else {
      badge = <StatusBadge tone="muted">Warten auf Meldungen</StatusBadge>;
    }
  }

  const winnerName =
    match.winnerId != null
      ? match.winnerId === match.participantAId
        ? aLabel
        : bLabel
      : null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="font-display text-base font-semibold text-ink">
          {aLabel} <span className="text-fg-dim">vs</span> {bLabel}
        </div>
        {badge}
      </div>

      {/* submitted player reports */}
      {match.reports.length > 0 && match.status !== "done" && (
        <div className="flex flex-col gap-1 text-sm text-fg-muted">
          {match.reports.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-display text-[10px] uppercase tracking-[0.12em] text-fg-dim">
                {r.byName ?? "Spieler"}
              </span>
              <span className="font-display font-semibold text-ink">
                {r.scoreA}:{r.scoreB}
              </span>
            </div>
          ))}
        </div>
      )}

      {match.status === "done" ? (
        <div
          className="rounded-xl border border-lime/30 bg-lime/[0.08] px-4 py-3 font-display text-sm font-semibold text-lime"
          role="status"
        >
          {match.scoreA}:{match.scoreB} · Sieger: {winnerName ?? "—"}
        </div>
      ) : bothSlotsFilled ? (
        <ConfirmForm
          matchId={match.id}
          aName={aLabel}
          bName={bLabel}
          defaultScoreA={agreed?.a ?? null}
          defaultScoreB={agreed?.b ?? null}
        />
      ) : (
        <p className="text-sm text-fg-dim">
          Wartet auf Teilnehmer aus vorherigen Runden.
        </p>
      )}
    </div>
  );
}
