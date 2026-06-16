"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle>{participant.display_name}</CardTitle>
      </CardHeader>
      <CardContent>
        {state === "loading" && (
          <p className="text-base" role="status">
            Checke ein…
          </p>
        )}
        {state === "success" && (
          <p className="text-base font-medium" role="status">
            ✅ {participant.display_name}, du bist eingecheckt!
          </p>
        )}
        {state === "already" && (
          <p className="text-base" role="status">
            Du bist bereits eingecheckt.
          </p>
        )}
        {state === "error" && (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
