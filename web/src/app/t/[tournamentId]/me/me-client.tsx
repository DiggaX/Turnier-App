"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import type { QueueStatus } from "@/lib/queue/wait-estimate";
import { QrCode } from "@/components/qr-code";
import { QrActions } from "@/components/qr-actions";
import { Button } from "@/components/ui/button";
import {
  ParticipantShell,
  SectionLabel,
} from "@/components/brand/participant-shell";
import { PhotoConsentChip } from "@/components/brand/photo-consent-chip";

import { PushOptIn } from "./push-opt-in";
import {
  MatchList,
  MatchReportCard,
  QueueCard,
  type MyMatch,
  type MyReport,
} from "./my-matches";
import { TeamCard, type TeamInfo } from "./team-card";

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
  /**
   * True when this view was resolved via a saved/shared recovery link
   * (`?token=`) instead of the owning browser session.
   *
   * Check-in and reporting still work here — they just take the token-keyed
   * RPCs, because the ordinary ones authorise on auth.uid() and a second device
   * cannot have that session. Push and Team stay out: a subscription belongs to
   * one device, and get_my_team resolves through auth.uid().
   */
  viaToken?: boolean;
  /** Alle eigenen Partien, in Spielreihenfolge. */
  matches: MyMatch[];
  queue: QueueStatus;
  /** Die naechste offene eigene Partie — die, die gemeldet werden kann. */
  openMatchId: string | null;
  myReport: MyReport | null;
  team: TeamInfo | null;
}

/** Never the raw DB message: it leaks schema and says nothing to a participant. */
const CHECK_IN_ERROR = "Check-in fehlgeschlagen.";

export function MeClient({
  participant,
  tournamentId,
  viaToken = false,
  matches,
  queue,
  openMatchId,
  myReport,
  team,
}: MeClientProps) {
  const router = useRouter();
  const [supabase] = useState<SupabaseClient<Database>>(() => createClient());
  // Der Server ist die Wahrheit; der lokale Merker deckt nur die Spanne
  // zwischen erfolgreicher RPC und dem naechsten Refresh ab. Als reiner
  // useState-Anfangswert wuerde ein Check-in durch die Orga (QR-Scan) nie
  // ankommen — die Seite bekommt jetzt frische Daten und wuerde sie wegwerfen.
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const checkedIn = participant.checked_in_at !== null || justCheckedIn;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Strict Mode double-invokes effects in dev; guard so we open exactly one
  // channel and don't tear down the live one on the throwaway second pass.
  const startedRef = useRef(false);

  // Ohne das steht der Spieler vor einer Seite, die seit zwanzig Minuten lügt:
  // Warteschlange, Ergebnisse und Freigaben ändern sich, ohne dass er etwas
  // tut. Best effort, wie beim Live-Board — ist Realtime nicht eingeschaltet,
  // bleibt die Serverdaten-Ansicht und ein Reload zeigt weiterhin alles.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const channel = supabase.channel(`me-${tournamentId}-${participant.id}`);
    try {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "matches",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    } catch {
      // Realtime not enabled / misconfigured — page still renders server data.
    }

    return () => {
      startedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, tournamentId, participant.id, router]);

  const hasConsent = participant.consents.length > 0;
  const openMatch = matches.find((m) => m.id === openMatchId) ?? null;

  async function handleCheckIn() {
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcErr } = viaToken
        ? await supabase.rpc("check_in_via_token", {
            p_qr_token: participant.qr_token,
          })
        : await supabase.rpc("check_in", {
            p_participant_id: participant.id,
            p_method: "online",
          });
      if (rpcErr) {
        setError(CHECK_IN_ERROR);
        return;
      }
      setJustCheckedIn(true);
    } catch {
      setError(CHECK_IN_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ParticipantShell eyebrow="/ Mein Status" heading="Mein Status" glow="lime">
      <div className="flex flex-col gap-4">
        {/* photo consent status — freiwillig, deshalb ist "keine" kein Fehler */}
        <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4">
          <span className="font-display text-sm font-semibold text-ink">
            {participant.display_name}
          </span>
          <PhotoConsentChip granted={hasConsent} />
        </div>

        {/* Das Match steht oben. Der QR ist genau einmal wichtig — beim
            Check-in — und danach nur noch im Weg. */}
        <QueueCard queue={queue} />

        {openMatch && (
          // key: sonst behaelt die Karte beim Realtime-Refresh ihren State,
          // wenn die Partie wechselt — der Spieler saehe die Meldung der
          // ALTEN Partie ("wartet auf Freigabe") und ihre Punktzahlen in den
          // Feldern der neuen und wuerde sie mit einem Tipp erneut melden.
          <MatchReportCard
            key={openMatch.id}
            supabase={supabase}
            match={openMatch}
            report={myReport}
            linkToken={viaToken ? participant.qr_token : null}
          />
        )}

        <MatchList matches={matches} />

        {team && <TeamCard team={team} />}

        {/* push opt-in — session only, see the viaToken note on MeClientProps */}
        {!viaToken && <PushOptIn tournamentId={tournamentId} />}

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

        {/* QR-Block: vor dem Check-in aufgeklappt, danach zugeklappt. React
            schreibt `open` nur bei einer Aenderung ins DOM, ein von Hand
            geoeffnetes <details> bleibt also beim Realtime-Refresh offen. */}
        <details
          open={!checkedIn}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <summary className="cursor-pointer list-none">
            <span className="flex items-center justify-between gap-3">
              <SectionLabel>Check-in-QR</SectionLabel>
              <span className="font-display text-[10px] uppercase tracking-[0.14em] text-fg-dim">
                {checkedIn ? "Check-in erledigt · anzeigen" : "Anzeigen"}
              </span>
            </span>
          </summary>

          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-white p-4">
              <QrCode value={participant.qr_token} ariaLabel="Dein Check-in-QR" />
            </div>
            <p className="text-sm text-fg-muted">
              Zeig das der Orga zum Check-in
            </p>
          </div>

          <div className="mt-5 border-t border-line pt-5">
            <QrActions
              tournamentId={tournamentId}
              qrToken={participant.qr_token}
              variant="bare"
            />
          </div>
        </details>

        {viaToken && (
          <p className="text-center text-sm text-fg-muted">
            Du bist über deinen gespeicherten Link hier — einchecken und
            Ergebnisse melden geht damit. Benachrichtigungen und dein Team
            siehst du auf dem Gerät, mit dem du dich angemeldet hast.
          </p>
        )}
      </div>
    </ParticipantShell>
  );
}
