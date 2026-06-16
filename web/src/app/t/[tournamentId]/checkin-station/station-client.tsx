"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ParticipantShell } from "@/components/brand/participant-shell";

interface Participant {
  id: string;
  display_name: string;
  checked_in_at: string | null;
}

interface StationClientProps {
  participant: Participant;
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

type State = "loading" | "success" | "already" | "error";

export function StationClient({ participant }: StationClientProps) {
  const [state, setState] = useState<State>(
    participant.checked_in_at !== null ? "already" : "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Guard against React Strict Mode double-invoke and subsequent re-renders.
  const didRun = useRef(false);

  useEffect(() => {
    if (participant.checked_in_at !== null) {
      return;
    }
    if (didRun.current) {
      return;
    }
    didRun.current = true;

    const supabase = createClient();

    async function doCheckIn() {
      try {
        const { error: rpcErr } = await supabase.rpc("check_in", {
          p_participant_id: participant.id,
          p_method: "station",
        });
        if (rpcErr) {
          setErrorMsg(checkInError(rpcErr));
          setState("error");
          return;
        }
        setState("success");
      } catch (e) {
        setErrorMsg(checkInError(e));
        setState("error");
      }
    }

    void doCheckIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ParticipantShell
      eyebrow="/ Check-in"
      heading="Check-in"
      glow="lime"
      subheading={participant.display_name}
    >
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
        {state === "loading" && (
          <p className="text-base text-fg-muted" role="status">
            Checke ein…
          </p>
        )}
        {state === "success" && (
          <div
            className="flex items-center gap-3 rounded-xl border border-lime/30 bg-lime/[0.08] px-4 py-4 font-display text-base font-semibold text-lime"
            role="status"
          >
            ✅ {participant.display_name}, du bist eingecheckt!
          </div>
        )}
        {state === "already" && (
          <div
            className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 px-4 py-4 text-base text-fg-muted"
            role="status"
          >
            Du bist bereits eingecheckt.
          </div>
        )}
        {state === "error" && (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        )}
      </div>
    </ParticipantShell>
  );
}
