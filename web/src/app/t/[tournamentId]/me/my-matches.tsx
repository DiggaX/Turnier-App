"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MatchStatus } from "@/lib/database.types";
import { getDisplayedScore, getMatchDisplayState } from "@/lib/live-match";
import { queueLabel, type QueueStatus } from "@/lib/queue/wait-estimate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/brand/participant-shell";

/** Die Meldung des eigenen Wettkaempfers zu einer Partie (Match-Seiten a/b). */
export interface MyReport {
  score_a: number;
  score_b: number;
}

/** Eine eigene Partie, fertig aufbereitet fuer die Anzeige. */
export interface MyMatch {
  id: string;
  round: number;
  status: MatchStatus;
  /** Die eigene Seite — daran haengt, welcher Score meiner ist. */
  mySide: "a" | "b";
  opponentName: string;
  scoreA: number | null;
  scoreB: number | null;
  liveScoreA: number | null;
  liveScoreB: number | null;
  liveEndedAt: string | null;
}

/**
 * Die Warteschlange, ganz oben und ohne Umschweife: der eine Satz, wegen dem
 * ein Spieler diese Seite offen laesst.
 */
export function QueueCard({ queue }: { queue: QueueStatus }) {
  const tone =
    queue.kind === "live"
      ? "border-live/40 bg-live/[0.08] text-live"
      : queue.kind === "next"
        ? "border-lime/40 bg-lime/[0.09] text-lime"
        : queue.kind === "waiting"
          ? "border-cyan/30 bg-cyan/[0.07] text-cyan"
          : "border-line bg-surface text-fg-muted";

  return (
    <div className={cn("rounded-2xl border px-5 py-5", tone)} role="status">
      <SectionLabel className="mb-2">Warteschlange</SectionLabel>
      <p className="font-display text-lg font-bold leading-snug">
        {queueLabel(queue)}
      </p>
      {queue.kind === "waiting" && (
        <p className="mt-2 text-sm text-fg-muted">
          Schätzung aus der geplanten Spieldauer — halt dich in der Nähe.
        </p>
      )}
    </div>
  );
}

/** Kurzer Statustext je Partie. */
function statusText(m: MyMatch): string {
  switch (getMatchDisplayState(m)) {
    case "live":
      return "Läuft";
    case "awaiting_confirmation":
      return "Wartet auf Freigabe";
    case "done":
      return "Gespielt";
    case "bye":
      return "Freilos";
    default:
      return "Steht an";
  }
}

/** Eine Zeile der eigenen Partien: Runde, Gegner, Status, ggf. Ergebnis. */
function MatchRow({ match }: { match: MyMatch }) {
  const score = getDisplayedScore(match);
  const state = getMatchDisplayState(match);
  const my = score ? (match.mySide === "a" ? score.scoreA : score.scoreB) : null;
  const opp = score ? (match.mySide === "a" ? score.scoreB : score.scoreA) : null;
  const won = my !== null && opp !== null && my > opp;

  return (
    <li className="flex items-center justify-between gap-3 border-t border-line px-1 py-3 first:border-t-0">
      <div className="min-w-0">
        <div className="truncate font-display text-sm font-semibold text-ink">
          vs {match.opponentName}
        </div>
        <div className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
          Runde {match.round} · {statusText(match)}
        </div>
      </div>
      {score ? (
        <div
          aria-label={`${my}:${opp}`}
          className="shrink-0 font-display text-base font-bold tabular-nums"
        >
          <span className={won && state === "done" ? "text-lime" : "text-ink"}>
            {my}
          </span>
          <span className="px-1 text-fg-dim">:</span>
          <span className="text-fg-muted">{opp}</span>
        </div>
      ) : (
        <span className="shrink-0 font-display text-sm text-fg-dim">—</span>
      )}
    </li>
  );
}

/** Alle eigenen Partien: laufende, kommende, gespielte — in Spielreihenfolge. */
export function MatchList({ matches }: { matches: MyMatch[] }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <SectionLabel className="mb-2">Deine Partien</SectionLabel>
      {matches.length === 0 ? (
        <p className="py-2 text-sm text-fg-muted">
          Sobald der Spielplan steht, findest du hier alle deine Partien.
        </p>
      ) : (
        <ul>
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Never the raw DB message: it leaks schema and says nothing to a participant. */
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

/**
 * Ergebnis melden fuer die naechste offene eigene Partie.
 *
 * Melden darf JEDES Teammitglied, nicht nur der Captain: nicht jeder hat sein
 * Handy dabei. Die Datenbank loest die Person selbst zum Wettkaempfer auf
 * (coalesce(team_id, id)) und haelt ueber unique(match_id, reported_by) eine
 * Stimme je Seite — die letzte Meldung des Teams gilt, bis die Orga freigibt.
 */
export function MatchReportCard({
  supabase,
  match,
  report,
  linkToken,
}: {
  supabase: SupabaseClient<Database>;
  match: MyMatch;
  report: MyReport | null;
  /** Set in shared-link mode; picks the token-keyed RPC instead of the session one. */
  linkToken: string | null;
}) {
  const [myScore, setMyScore] = useState(
    report ? String(myScoreFromReport(report, match.mySide)) : "",
  );
  const [oppScore, setOppScore] = useState(
    report ? String(oppScoreFromReport(report, match.mySide)) : "",
  );
  const [reported, setReported] = useState<MyReport | null>(report);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Der Server ist die Wahrheit; `started` deckt nur die Spanne zwischen
  // erfolgreicher RPC und dem naechsten Realtime-Refresh ab.
  const running = match.status === "live" || started;

  /**
   * Die Partie starten, wenn kein Scorekeeper da ist.
   *
   * Das ist mehr als Kosmetik: erst eine laufende Partie sagt der Warteschlange
   * aller anderen, dass hier gerade gespielt wird. Ohne Start zaehlen sie diese
   * Partie weiter als wartend und bekommen eine Schaetzung, die eine Partie zu
   * lang ist.
   *
   * Zaehlen und Beenden bleiben beim Scorekeeper — das Ergebnis meldet ihr
   * unten, und meldet ihr beide dasselbe, gewinnt eure Einigkeit ohnehin vor
   * jedem Scorekeeper-Vorschlag.
   */
  async function handleStart() {
    setError(null);
    setStarting(true);
    try {
      const { error: rpcErr } = await supabase.rpc("start_match_as_player", {
        p_match_id: match.id,
        ...(linkToken ? { p_qr_token: linkToken } : {}),
      });
      if (rpcErr) {
        setError(reportError(rpcErr));
        return;
      }
      setStarted(true);
    } catch (e) {
      setError(reportError(e));
    } finally {
      setStarting(false);
    }
  }

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
      const { error: rpcErr } = linkToken
        ? await supabase.rpc("report_match_via_token", {
            p_qr_token: linkToken,
            p_match_id: match.id,
            ...scores,
          })
        : await supabase.rpc("report_match", {
            p_match_id: match.id,
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

      {running ? (
        <div
          className="mb-4 rounded-xl border border-live/40 bg-live/[0.08] px-4 py-3 text-sm text-live"
          role="status"
        >
          Läuft gerade.
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleStart()}
            disabled={starting || submitting}
            className="h-12 font-display text-sm font-bold uppercase tracking-wider"
          >
            {starting ? "Wird gestartet…" : "Partie starten"}
          </Button>
          <p className="text-xs text-fg-muted">
            Nur nötig, wenn kein Scorekeeper zählt — dann sehen die anderen, dass
            ihr spielt.
          </p>
        </div>
      )}

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
