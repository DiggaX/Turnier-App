"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Participant {
  id: string;
  display_name: string;
  qr_token: string;
  checked_in_at: string | null;
  consents: { id: string }[];
}

interface MeClientProps {
  participant: Participant;
  tournamentId: string;
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

export function MeClient({ participant }: MeClientProps) {
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  const [checkedIn, setCheckedIn] = useState(
    participant.checked_in_at !== null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasConsent = participant.consents.length > 0;

  async function handleCheckIn() {
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcErr } = await supabase.rpc("check_in", {
        p_participant_id: participant.id,
        p_method: "online",
      });
      if (rpcErr) {
        setError(checkInError(rpcErr));
        return;
      }
      setCheckedIn(true);
    } catch (e) {
      setError(checkInError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{participant.display_name}</CardTitle>
        <CardDescription>
          {hasConsent ? (
            <Badge className="bg-green-600 text-white">
              Einwilligung erteilt
            </Badge>
          ) : (
            <Badge variant="destructive">Einwilligung fehlt</Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <QrCode value={participant.qr_token} ariaLabel="Dein Check-in-QR" />
            <p className="text-sm text-muted-foreground">
              Zeig das der Orga zum Check-in
            </p>
          </div>

          {checkedIn ? (
            <p className="text-base font-medium" role="status">
              ✅ Eingecheckt
            </p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Button
                type="button"
                onClick={() => void handleCheckIn()}
                disabled={submitting}
              >
                {submitting ? "Wird eingecheckt…" : "Jetzt online einchecken"}
              </Button>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
