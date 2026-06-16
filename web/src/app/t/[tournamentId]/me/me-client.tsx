"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ParticipantShell,
  SectionLabel,
} from "@/components/brand/participant-shell";

interface Participant {
  id: string;
  display_name: string;
  qr_token: string;
  checked_in_at: string | null;
  consents: { id: string }[];
}

interface MeClientProps {
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
    <ParticipantShell
      eyebrow="/ Mein Status"
      heading="Mein Status"
      glow="lime"
    >
      <div className="flex flex-col gap-4">
        {/* consent status */}
        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4">
          <span className="font-display text-sm font-semibold text-ink">
            {participant.display_name}
          </span>
          {hasConsent ? (
            <Badge className="bg-lime/15 text-lime">Einwilligung erteilt</Badge>
          ) : (
            <Badge variant="destructive">Einwilligung fehlt</Badge>
          )}
        </div>

        {/* QR card */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <SectionLabel className="mb-4 text-center">
            Dein Check-in-QR
          </SectionLabel>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-4">
              <QrCode
                value={participant.qr_token}
                ariaLabel="Dein Check-in-QR"
              />
            </div>
            <p className="text-sm text-fg-muted">
              Zeig das der Orga zum Check-in
            </p>
          </div>
        </div>

        {/* check-in action */}
        {checkedIn ? (
          <div
            className="flex items-center justify-center gap-2 rounded-2xl border border-lime/30 bg-lime/[0.08] px-5 py-4 font-display text-base font-semibold text-lime"
            role="status"
          >
            ✅ Eingecheckt
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <Button
              type="button"
              onClick={() => void handleCheckIn()}
              disabled={submitting}
              className="h-12 font-display text-sm font-bold uppercase tracking-wider"
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
    </ParticipantShell>
  );
}
