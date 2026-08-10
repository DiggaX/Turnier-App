"use client";

import { Check, Minus, Pencil, Play, Plus } from "lucide-react";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SectionLabel } from "@/components/brand/participant-shell";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/**
 * The subset of `get_scorekeeper_match` this control needs. A full
 * ScorekeeperMatch is assignable to it, so both callers pass what they have.
 */
export type LiveMatchView = {
  status: Database["public"]["Enums"]["match_status"];
  participant_a_name: string | null;
  participant_b_name: string | null;
  live_score_a: number | null;
  live_score_b: number | null;
  live_ended_at: string | null;
  score_a: number | null;
  score_b: number | null;
};

export type LiveScoreControlProps = {
  /** Scorekeeper bearer token for this match. */
  token: string;
  initialMatch: LiveMatchView;
  /** Called after every successful action, e.g. to refresh a surrounding page. */
  onChange?: () => void;
};

function scorekeeperError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";

  if (message.toLowerCase().includes("decided")) {
    return "Das Ergebnis wurde bereits vom Schiedsrichter freigegeben.";
  }
  return "Der Live-Score konnte nicht aktualisiert werden.";
}

function ScoreControl({
  name,
  score,
  disabled,
  onChange,
}: {
  name: string | null;
  score: number;
  disabled: boolean;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
      <span className="max-w-full truncate text-center font-display text-base font-semibold text-ink">
        {name ?? "TBD"}
      </span>
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          disabled={disabled || score === 0}
          onClick={() => onChange(-1)}
          aria-label={(name ?? "Team") + ": ein Tor abziehen"}
        >
          <Minus />
        </Button>
        <output className="min-w-14 text-center font-display text-5xl font-bold tabular-nums text-ink">
          {score}
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          disabled={disabled}
          onClick={() => onChange(1)}
          aria-label={(name ?? "Team") + ": ein Tor hinzuf?gen"}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

/**
 * Start / count / finish one match live.
 *
 * Shared by the scorekeeper's own page (/score/[token]) and the organizer's
 * match list, so an event without a dedicated scorekeeper can be run entirely
 * from the orga screen. Every action goes through the same SECURITY DEFINER
 * RPCs keyed on the match token — the organizer gets no extra privilege here,
 * only the same link on a screen they already hold.
 *
 * Live values stay display-only; the official result is still written by
 * confirm_match.
 */
export function LiveScoreControl({
  token,
  initialMatch,
  onChange,
}: LiveScoreControlProps) {
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [match, setMatch] = useState<LiveMatchView>(initialMatch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoreA = match.live_score_a ?? 0;
  const scoreB = match.live_score_b ?? 0;
  const isDone = match.status === "done";
  const isLive = match.status === "live";
  const isEnded = match.live_ended_at !== null;

  async function reloadMatch() {
    const { data, error: reloadError } = await supabase.rpc(
      "get_scorekeeper_match",
      { p_token: token },
    );
    if (reloadError || !data?.[0]) {
      throw reloadError ?? new Error("match not found");
    }
    setMatch(data[0]);
  }

  async function runAction(
    action:
      | "start_live_match"
      | "reopen_live_match"
      | "finish_live_match"
      | "update_live_score",
    score?: { a: number; b: number },
  ) {
    setError(null);
    setSaving(true);
    try {
      const args =
        score == null
          ? { p_token: token }
          : { p_token: token, p_score_a: score.a, p_score_b: score.b };
      const { error: rpcError } = await supabase.rpc(action, args);
      if (rpcError) throw rpcError;
      await reloadMatch();
      onChange?.();
    } catch (actionError) {
      setError(scorekeeperError(actionError));
      await reloadMatch().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  }

  function changeScore(side: "a" | "b", delta: number) {
    const nextA = side === "a" ? scoreA + delta : scoreA;
    const nextB = side === "b" ? scoreB + delta : scoreB;
    if (nextA < 0 || nextB < 0) return;
    void runAction("update_live_score", { a: nextA, b: nextB });
  }

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Scorekeeper</SectionLabel>
        {isLive && !isEnded && (
          <span className="inline-flex items-center gap-1.5 font-display text-[10px] uppercase tracking-[0.16em] text-live">
            <span
              aria-hidden
              className="size-1.5 animate-pulse rounded-full bg-live"
            />
            Live
          </span>
        )}
      </div>

      {isDone ? (
        <div className="rounded-xl border border-lime/30 bg-lime/[0.08] px-4 py-5 text-center">
          <p className="font-display text-sm uppercase tracking-[0.14em] text-lime">
            Ergebnis freigegeben
          </p>
          <p className="mt-2 font-display text-4xl font-bold tabular-nums text-ink">
            {match.score_a}:{match.score_b}
          </p>
        </div>
      ) : match.status === "pending" ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-fg-muted">
            Erst starten, wenn beide Teams bereit sind.
          </p>
          <Button
            type="button"
            className="h-13 font-display text-base font-bold uppercase tracking-wider"
            disabled={saving}
            onClick={() => void runAction("start_live_match")}
          >
            <Play data-icon="inline-start" />
            Spiel starten
          </Button>
        </div>
      ) : isEnded ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-cyan/30 bg-cyan/[0.08] px-4 py-5 text-center">
            <p className="font-display text-sm uppercase tracking-[0.14em] text-cyan">
              Wartet auf Freigabe
            </p>
            <p className="mt-2 font-display text-4xl font-bold tabular-nums text-ink">
              {scoreA}:{scoreB}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12 font-display text-sm font-bold uppercase tracking-wider"
            disabled={saving}
            onClick={() => void runAction("reopen_live_match")}
          >
            <Pencil data-icon="inline-start" />
            Ergebnis korrigieren
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <ScoreControl
              name={match.participant_a_name}
              score={scoreA}
              disabled={saving}
              onChange={(delta) => changeScore("a", delta)}
            />
            <span className="mt-10 font-display text-2xl text-fg-dim">:</span>
            <ScoreControl
              name={match.participant_b_name}
              score={scoreB}
              disabled={saving}
              onChange={(delta) => changeScore("b", delta)}
            />
          </div>
          <Button
            type="button"
            className="h-13 font-display text-base font-bold uppercase tracking-wider"
            disabled={saving}
            onClick={() =>
              void runAction("finish_live_match", { a: scoreA, b: scoreB })
            }
          >
            <Check data-icon="inline-start" />
            Spiel beenden
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
