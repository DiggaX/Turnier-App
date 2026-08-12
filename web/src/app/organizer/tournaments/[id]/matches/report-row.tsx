import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ScorekeeperQr } from "@/components/scorekeeper-qr";
import { agreedScore, scorePrefill } from "@/lib/station/station";

import { ConfirmForm } from "./confirm-form";
import { LiveControl } from "./live-control";

/** A single player report in match (a/b) terms. */
export type ReportView = {
  /** Reporting competitor's display name (the team, or the solo starter). */
  byName: string | null;
  /** The person who actually submitted it — a team member, if resolvable. */
  personName: string | null;
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
  /** Aufstellung der jeweiligen Seite, fertige Zeile — null beim Einzelstarter. */
  aRoster: string | null;
  bRoster: string | null;
  winnerId: string | null;
  participantAId: string | null;
  participantBId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  liveScoreA: number | null;
  liveScoreB: number | null;
  liveEndedAt: string | null;
  scorekeeperToken: string | null;
  /** Player reports for this match, in match (a/b) terms. */
  reports: ReportView[];
};

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
  const prefill = scorePrefill(match.reports, {
    liveScoreA: match.liveScoreA,
    liveScoreB: match.liveScoreB,
    liveEndedAt: match.liveEndedAt,
  });

  let badge: ReactNode = null;
  if (match.status !== "done") {
    if (match.reports.length === 0) {
      badge = <StatusBadge tone="muted">Warten auf Meldungen</StatusBadge>;
    } else if (agreed) {
      badge = (
        <StatusBadge tone="ok">
          ✓ Einig: {agreed.scoreA}:{agreed.scoreB}
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
        <div className="min-w-0">
          <div className="font-display text-base font-semibold text-ink">
            {aLabel} <span className="text-fg-dim">vs</span> {bLabel}
          </div>
          {/* Aufstellungen: im Spielplan steht nur der Teamname. Beide Zeilen
              tragen ihren Teamnamen davor — zwei nackte Namenslisten verraten
              nicht, wer zu wem gehoert. Beim Einzelturnier ist beides null. */}
          {(match.aRoster || match.bRoster) && (
            <div className="mt-1 flex flex-col gap-0.5 text-xs leading-relaxed text-fg-dim">
              {match.aRoster && (
                <div>
                  <span className="text-fg-muted">{aLabel}:</span>{" "}
                  {match.aRoster}
                </div>
              )}
              {match.bRoster && (
                <div>
                  <span className="text-fg-muted">{bLabel}:</span>{" "}
                  {match.bRoster}
                </div>
              )}
            </div>
          )}
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
              {r.personName && r.personName !== r.byName && (
                <span className="text-xs text-fg-dim">
                  gemeldet von {r.personName}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {match.scorekeeperToken &&
        match.status !== "done" &&
        match.status !== "bye" &&
        bothSlotsFilled && (
          <>
            <ScorekeeperQr
              token={match.scorekeeperToken}
              label={"Scorekeeper-QR fuer " + aLabel + " gegen " + bLabel}
            />
            {/* Same controls as the QR leads to — for when nobody scans it. */}
            <LiveControl
              token={match.scorekeeperToken}
              match={{
                status: match.status,
                participant_a_name: match.aName,
                participant_b_name: match.bName,
                live_score_a: match.liveScoreA,
                live_score_b: match.liveScoreB,
                live_ended_at: match.liveEndedAt,
                score_a: match.scoreA,
                score_b: match.scoreB,
              }}
            />
          </>
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
          defaultScoreA={prefill?.scoreA ?? null}
          defaultScoreB={prefill?.scoreB ?? null}
          suggestionSource={prefill?.source}
        />
      ) : (
        <p className="text-sm text-fg-dim">
          Wartet auf Teilnehmer aus vorherigen Runden.
        </p>
      )}
    </div>
  );
}
