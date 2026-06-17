"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generateBracket } from "./actions";

export type GenerateButtonProps = {
  tournamentId: string;
  /** When true, the bracket already exists — warn that this replaces it. */
  regenerate?: boolean;
};

/**
 * Triggers bracket generation for a tournament. Shows a pending state and any
 * error, and refreshes the route on success so the new bracket renders.
 * When `regenerate` is set, the label and a confirm step warn that the existing
 * bracket will be replaced.
 */
export function GenerateButton({
  tournamentId,
  regenerate = false,
}: GenerateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      regenerate &&
      !window.confirm(
        "Das bestehende Bracket wird ersetzt und alle Matches neu generiert. Fortfahren?",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await generateBracket(tournamentId);
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
      {regenerate && (
        <p className="text-xs text-fg-dim">
          Ersetzt das bestehende Bracket und alle Matches.
        </p>
      )}
      {error && <p className="text-sm text-live">{error}</p>}
    </div>
  );
}
