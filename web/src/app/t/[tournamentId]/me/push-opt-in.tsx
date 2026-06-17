"use client";

import { useState } from "react";

import { enablePush, pushSupported } from "@/lib/push/client";
import { subscribeParticipant } from "./push-actions";

export function PushOptIn({ tournamentId }: { tournamentId: string }) {
  const [state, setState] = useState<"idle" | "working" | "on" | "error">(
    "idle",
  );
  const [msg, setMsg] = useState<string | null>(null);

  if (!pushSupported()) return null;
  const configured = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  async function onClick() {
    setState("working");
    setMsg(null);
    const sub = await enablePush();
    if (!sub) {
      setState("error");
      setMsg("Benachrichtigungen nicht möglich (Berechtigung abgelehnt?).");
      return;
    }
    const res = await subscribeParticipant(tournamentId, sub);
    if ("error" in res) {
      setState("error");
      setMsg(res.error);
      return;
    }
    setState("on");
    setMsg("Du wirst benachrichtigt, wenn dein Match bereit ist.");
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
      <div className="font-display text-sm font-semibold text-ink">
        Match-Benachrichtigungen
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "working" || state === "on" || !configured}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-cyan/15 px-4 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
      >
        {state === "on"
          ? "Aktiviert ✓"
          : state === "working"
            ? "Aktiviere…"
            : "Benachrichtigungen aktivieren"}
      </button>
      {!configured && (
        <p className="text-xs text-fg-dim">Push ist noch nicht konfiguriert.</p>
      )}
      {msg && (
        <p className={state === "error" ? "text-xs text-live" : "text-xs text-fg-muted"}>
          {msg}
        </p>
      )}
    </div>
  );
}
