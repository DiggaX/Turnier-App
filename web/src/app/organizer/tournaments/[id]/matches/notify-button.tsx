"use client";

import { useState, useTransition } from "react";

import { notifyPlayableMatches } from "./notify-actions";

export function NotifyButton({ tournamentId }: { tournamentId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onClick() {
    setMsg(null);
    startTransition(async () => {
      const res = await notifyPlayableMatches(tournamentId);
      setMsg("error" in res ? res.error : `${res.sent} Benachrichtigung(en) gesendet.`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] border border-cyan/40 bg-cyan/10 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-50"
      >
        {pending ? "Sende…" : "Spielbare Matches benachrichtigen"}
      </button>
      {msg && <p className="text-xs text-fg-muted">{msg}</p>}
    </div>
  );
}
