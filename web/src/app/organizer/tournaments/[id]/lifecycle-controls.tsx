"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { TournamentStatus } from "@/lib/database.types";
import { nextStatus } from "@/lib/tournament/lifecycle";
import { advanceStatus, deleteTournament } from "../actions";

const NEXT_LABEL: Record<string, string> = {
  registration: "Anmeldung öffnen",
  finished: "Turnier beenden",
};

export function LifecycleControls({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: TournamentStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const target = nextStatus(status);

  function advance() {
    setError(null);
    startTransition(async () => {
      const res = await advanceStatus(tournamentId, status);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        "Turnier wirklich löschen? Das entfernt alle Matches und Teilnehmer.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTournament(tournamentId);
      if ("error" in res) setError(res.error);
      else router.push("/organizer");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {target && (
        <button
          type="button"
          onClick={advance}
          disabled={pending}
          className="rounded-[10px] bg-lime px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {NEXT_LABEL[target] ?? target}
        </button>
      )}
      {status === "registration" && (
        <span className="font-display text-xs uppercase tracking-[0.12em] text-fg-dim">
          Zum Starten: Bracket im Tab &bdquo;Bracket&ldquo; generieren.
        </span>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-[10px] border border-live/40 bg-live/10 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-live transition-colors hover:bg-live/20 disabled:opacity-50"
      >
        Löschen
      </button>
      {error && <p className="w-full text-sm text-live">{error}</p>}
    </div>
  );
}
