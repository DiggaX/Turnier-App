"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { lostWork } from "@/lib/bracket/regenerate-warning";

import { generateBracket } from "./actions";

export type GenerateButtonProps = {
  tournamentId: string;
  /** When true, the bracket already exists — warn that this replaces it. */
  regenerate?: boolean;
  /** Released results this regenerate would delete. */
  decidedCount?: number;
  /** Matches currently being counted, which it would delete too. */
  liveCount?: number;
};

/**
 * Triggers bracket generation for a tournament. Shows a pending state and any
 * error, and refreshes the route on success so the new bracket renders.
 *
 * When `regenerate` is set the label and a confirm step warn that the existing
 * bracket will be replaced. Once there is work in it — released results or a
 * match being counted, the normal state once someone is added late — the dialog
 * names exactly what is about to be lost, and confirming is what unlocks the
 * server's guard. A generic "are you sure" does not carry that: the count is
 * the part that makes someone stop.
 */
export function GenerateButton({
  tournamentId,
  regenerate = false,
  decidedCount = 0,
  liveCount = 0,
}: GenerateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lost = regenerate ? lostWork(decidedCount, liveCount) : null;

  function onClick() {
    if (lost) {
      if (
        !window.confirm(
          `ACHTUNG: ${lost.label} ${lost.plural ? "werden" : "wird"} dabei ` +
            "unwiderruflich gelöscht.\n\n" +
            "Das Bracket wird komplett neu ausgelost — alle bisherigen " +
            "Spielstände sind danach weg und müssen neu eingetragen " +
            "werden.\n\nWirklich neu generieren?",
        )
      ) {
        return;
      }
    } else if (
      regenerate &&
      !window.confirm(
        "Das bestehende Bracket wird ersetzt und alle Matches neu generiert. Fortfahren?",
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await generateBracket(tournamentId, {
        discardResults: lost !== null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-7 py-3.5 font-display text-sm font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "Generiere…"
          : regenerate
            ? "Neu generieren"
            : "Generieren"}
      </button>
      {regenerate &&
        (lost ? (
          <p className="text-xs text-live">
            Löscht das Bracket — {lost.label} {lost.plural ? "gehen" : "geht"}{" "}
            dabei verloren.
          </p>
        ) : (
          <p className="text-xs text-fg-dim">
            Ersetzt das bestehende Bracket und alle Matches.
          </p>
        ))}
      {error && <p className="text-sm text-live">{error}</p>}
    </div>
  );
}
