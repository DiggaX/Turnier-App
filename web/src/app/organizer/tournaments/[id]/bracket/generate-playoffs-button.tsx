"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generatePlayoffs } from "./actions";

export function GeneratePlayoffsButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await generatePlayoffs(tournamentId);
      if ("error" in res) {
        setError(res.error);
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
        disabled={pending}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-6 py-3 font-display text-sm font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Wird ausgelost…" : "Playoffs auslosen →"}
      </button>
      {error && <p className="text-sm text-live">{error}</p>}
    </div>
  );
}
