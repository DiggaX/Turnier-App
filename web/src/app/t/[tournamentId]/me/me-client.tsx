"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ParticipantShell,
  SectionLabel,
} from "@/components/brand/participant-shell";
import { PushOptIn } from "./push-opt-in";

interface Participant {
  id: string;
  display_name: string;
  qr_token: string;
  checked_in_at: string | null;
  consents: { id: string }[];
}

/** The participant's existing report for the current match (match-side scores). */
export interface MyReport {
  score_a: number;
  score_b: number;
}

/** The participant's current open match, with their side and any prior report. */
export interface CurrentMatch {
  matchId: string;
  opponentName: string;
  mySide: "a" | "b";
  myReport: MyReport | null;
}

interface MeClientProps {
  participant: Participant;
  currentMatch: CurrentMatch | null;
  tournamentId: string;
}

/** Map a check_in RPC failure to a friendly German message (no raw DB leak). */
function checkInError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  if (message.toLowerCase().includes("consent")) {
    return "Einwilligung fehlt — Check-in nicht möglich.";
  }
  return "Check-in fehlgeschlagen.";
}

/** Map a report_match RPC failure to a friendly German message. */
function reportError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const lower = message.toLowerCase();
  if (lower.includes("participant")) {
    return "Du bist kein Teilnehmer dieses Matches.";
  }
  if (lower.includes("invalid score")) {
    return "Ungültiger Score. Bitte prüfe deine Eingabe.";
  }
  return "Ergebnis konnte nicht gemeldet werden.";
}

/**
 * Map a "mein Score" / "Gegner-Score" pair to the match-term (a/b) scores the
 * RPC expects. A side-A participant's own score is score_a; a side-B
 * participant's own score is score_b.
 */
function toMatchScores(
  mySide: "a" | "b",
  myScore: number,
  oppScore: number,
): { p_score_a: number; p_score_b: number } {
  return mySide === "a"
    ? { p_score_a: myScore, p_score_b: oppScore }
    : { p_score_a: oppScore, p_score_b: myScore };
}

/** Read the participant's own score from a stored report given their side. */
function myScoreFromReport(report: MyReport, mySide: "a" | "b"): number {
  return mySide === "a" ? report.score_a : report.score_b;
}

/** Read the opponent's score from a stored report given the participant's side. */
function oppScoreFromReport(report: MyReport, mySide: "a" | "b"): number {
  return mySide === "a" ? report.score_b : report.score_a;
}

function MatchReportCard({
  supabase,
  match,
}: {
  supabase: SupabaseClient<Database>;
  match: CurrentMatch;
}) {
  const [myScore, setMyScore] = useState(
    match.myReport ? String(myScoreFromReport(match.myReport, match.mySide)) : "",
  );
  const [oppScore, setOppScore] = useState(
    match.myReport
      ? String(oppScoreFromReport(match.myReport, match.mySide))
      : "",
  );
  const [reported, setReported] = useState<MyReport | null>(match.myReport);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReport() {
    setError(null);
    const my = Number(myScore);
    const opp = Number(oppScore);
    if (
      myScore.trim() === "" ||
      oppScore.trim() === "" ||
      !Number.isInteger(my) ||
      !Number.isInteger(opp) ||
      my < 0 ||
      opp < 0
    ) {
      setError("Bitte gib zwei gültige Punktzahlen ein.");
      return;
    }
    setSubmitting(true);
    try {
      const scores = toMatchScores(match.mySide, my, opp);
      const { error: rpcErr } = await supabase.rpc("report_match", {
        p_match_id: match.matchId,
        ...scores,
      });
      if (rpcErr) {
        setError(reportError(rpcErr));
        return;
      }
      setReported({ score_a: scores.p_score_a, score_b: scores.p_score_b });
    } catch (e) {
      setError(reportError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <SectionLabel className="mb-3">Dein aktuelles Match</SectionLabel>
      <p className="mb-4 font-display text-base font-semibold text-ink">
        vs {match.opponentName}
      </p>

      {reported && (
        <div
          className="mb-4 rounded-xl border border-cyan/30 bg-cyan/[0.08] px-4 py-3 text-sm text-cyan"
          role="status"
        >
          Gemeldet: {myScoreFromReport(reported, match.mySide)}:
          {oppScoreFromReport(reported, match.mySide)} — wartet auf Freigabe
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
              Dein Score
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={myScore}
              onChange={(e) => setMyScore(e.target.value)}
              aria-label="Dein Score"
              className="h-11 rounded-xl border border-line bg-bg px-3 font-display text-base font-semibold text-ink outline-none focus:border-lime/60"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
              Gegner-Score
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={oppScore}
              onChange={(e) => setOppScore(e.target.value)}
              aria-label="Gegner-Score"
              className="h-11 rounded-xl border border-line bg-bg px-3 font-display text-base font-semibold text-ink outline-none focus:border-lime/60"
            />
          </label>
        </div>

        <Button
          type="button"
          onClick={() => void handleReport()}
          disabled={submitting}
          className="h-12 font-display text-sm font-bold uppercase tracking-wider"
        >
          {submitting
            ? "Wird gemeldet…"
            : reported
              ? "Ergebnis aktualisieren"
              : "Ergebnis melden"}
        </Button>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function MeClient({ participant, currentMatch, tournamentId }: MeClientProps) {
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [checkedIn, setCheckedIn] = useState(
    participant.checked_in_at !== null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasConsent = participant.consents.length > 0;

  async function handleCheckIn() {
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc("check_in", {
        p_participant_id: participant.id,
        p_method: "online",
      });
      if (rpcErr) {
        setError(checkInError(rpcErr));
        return;
      }
      setCheckedIn(true);
    } catch (e) {
      setError(checkInError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ParticipantShell
      eyebrow="/ Mein Status"
      heading="Mein Status"
      glow="lime"
    >
      <div className="flex flex-col gap-4">
        {/* consent status */}
        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4">
          <span className="font-display text-sm font-semibold text-ink">
            {participant.display_name}
          </span>
          {hasConsent ? (
            <Badge className="bg-lime/15 text-lime">Einwilligung erteilt</Badge>
          ) : (
            <Badge variant="destructive">Einwilligung fehlt</Badge>
          )}
        </div>

        {/* current match report */}
        {currentMatch && (
          <MatchReportCard supabase={supabase} match={currentMatch} />
        )}

        {/* push opt-in */}
        <PushOptIn tournamentId={tournamentId} />

        {/* QR card */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <SectionLabel className="mb-4 text-center">
            Dein Check-in-QR
          </SectionLabel>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-4">
              <QrCode
                value={participant.qr_token}
                ariaLabel="Dein Check-in-QR"
              />
            </div>
            <p className="text-sm text-fg-muted">
              Zeig das der Orga zum Check-in
            </p>
          </div>
        </div>

        {/* check-in action */}
        {checkedIn ? (
          <div
            className="flex items-center justify-center gap-2 rounded-2xl border border-lime/30 bg-lime/[0.08] px-5 py-4 font-display text-base font-semibold text-lime"
            role="status"
          >
            ✅ Eingecheckt
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <Button
              type="button"
              onClick={() => void handleCheckIn()}
              disabled={submitting}
              className="h-12 font-display text-sm font-bold uppercase tracking-wider"
            >
              {submitting ? "Wird eingecheckt…" : "Jetzt online einchecken"}
            </Button>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </ParticipantShell>
  );
}
