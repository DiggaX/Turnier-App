"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { SerializedSubscription } from "@/lib/push/client";

export type PushActionResult = { ok: true } | { error: string };

/**
 * Store (upsert by endpoint) a push subscription for the participant the caller
 * owns in this tournament. RLS additionally enforces participant ownership.
 */
export async function subscribeParticipant(
  tournamentId: string,
  sub: SerializedSubscription,
): Promise<PushActionResult> {
  if (!sub?.endpoint || !sub?.p256dh || !sub?.auth) {
    return { error: "Ungültige Push-Anmeldung." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { data: participant } = await supabase
    .from("participants")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!participant) return { error: "Kein Teilnehmer in diesem Turnier." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      participant_id: participant.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return { error: friendlyDbError(error, "Push-Anmeldung fehlgeschlagen.") };
  }
  return { ok: true };
}
