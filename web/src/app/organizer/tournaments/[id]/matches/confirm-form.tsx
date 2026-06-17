"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

export type ConfirmFormProps = {
  matchId: string;
  /** Side-A participant name (left column / score_a). */
  aName: string;
  /** Side-B participant name (right column / score_b). */
  bName: string;
  /** Prefill for score_a (e.g. the agreed score), if any. */
  defaultScoreA?: number | null;
  /** Prefill for score_b (e.g. the agreed score), if any. */
  defaultScoreB?: number | null;
};

/** Map a confirm_match RPC failure to a friendly German message. */
function confirmError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const lower = message.toLowerCase();
  if (lower.includes("draw")) {
    return "Unentschieden ist nicht erlaubt.";
  }
  if (lower.includes("staff")) {
    return "Diese Aktion ist nur für die Orga erlaubt.";
  }
  if (lower.includes("empty slot")) {
    return "Das Match hat noch keinen Gegner.";
  }
  if (lower.includes("invalid score")) {
    return "Ungültiger Score. Bitte prüfe deine Eingabe.";
  }
  return "Ergebnis konnte nicht freigegeben werden.";
}

/**
 * Referee score entry + confirm for one match. Works both as a confirmation of
 * agreeing player reports (prefilled) and as a direct entry (blank). Rejects
 * draws client-side, then calls `confirm_match` (staff-only) which sets the
 * winner, marks the match done and advances the winner. Refreshes on success.
 */
export function ConfirmForm({
  matchId,
  aName,
  bName,
  defaultScoreA,
  defaultScoreB,
}: ConfirmFormProps) {
  const router = useRouter();
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [scoreA, setScoreA] = useState(
    defaultScoreA != null ? String(defaultScoreA) : "",
  );
  const [scoreB, setScoreB] = useState(
    defaultScoreB != null ? String(defaultScoreB) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    const a = Number(scoreA);
    const b = Number(scoreB);
    if (
      scoreA.trim() === "" ||
      scoreB.trim() === "" ||
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0
    ) {
      setError("Bitte gib zwei gültige Punktzahlen ein.");
      return;
    }
    if (a === b) {
      setError("Unentschieden ist nicht erlaubt.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc("confirm_match", {
        p_match_id: matchId,
        p_score_a: a,
        p_score_b: b,
      });
      if (rpcErr) {
        setError(confirmError(rpcErr));
        return;
      }
      router.refresh();
    } catch (e) {
      setError(confirmError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="truncate font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
            {aName}
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            aria-label={`Score ${aName}`}
            className="h-11 rounded-xl border border-line bg-bg px-3 font-display text-base font-semibold text-ink outline-none focus:border-lime/60"
          />
        </label>
        <span className="pb-3 font-display text-sm text-fg-dim">:</span>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="truncate font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
            {bName}
          </span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            aria-label={`Score ${bName}`}
            className="h-11 rounded-xl border border-line bg-bg px-3 font-display text-base font-semibold text-ink outline-none focus:border-lime/60"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={submitting}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-7 py-3 font-display text-sm font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Wird freigegeben…" : "Freigeben"}
      </button>

      {error && (
        <p className="text-sm text-live" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
