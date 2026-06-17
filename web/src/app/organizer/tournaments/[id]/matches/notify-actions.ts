"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { participantsToNotify } from "@/lib/push/targets";
import { isPushConfigured, sendPush } from "@/lib/push/server";

export type NotifyResult = { ok: true; sent: number } | { error: string };

/**
 * Staff action: push "Dein Match ist bereit" to both sides of every currently
 * playable match in the tournament. Prunes expired subscriptions. Requires the
 * caller to be staff (enforced by RLS on the writes + an explicit profile check).
 */
export async function notifyPlayableMatches(
  tournamentId: string,
): Promise<NotifyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    return { error: "Diese Aktion ist nicht erlaubt." };
  }
  if (!isPushConfigured()) {
    return { error: "Push ist nicht konfiguriert (VAPID-Keys fehlen)." };
  }

  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select("status, participant_a_id, participant_b_id")
    .eq("tournament_id", tournamentId);
  if (mErr) {
    return { error: friendlyDbError(mErr, "Matches konnten nicht geladen werden.") };
  }

  const targetIds = [
    ...participantsToNotify(
      (matches ?? []).map((m) => ({
        status: m.status,
        participantAId: m.participant_a_id,
        participantBId: m.participant_b_id,
      })),
    ),
  ];
  if (targetIds.length === 0) return { ok: true, sent: 0 };

  const { data: subs, error: sErr } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, participant_id")
    .in("participant_id", targetIds);
  if (sErr) {
    return { error: friendlyDbError(sErr, "Push-Anmeldungen konnten nicht geladen werden.") };
  }

  let sent = 0;
  const stale: string[] = [];
  for (const s of subs ?? []) {
    const res = await sendPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      {
        title: "Dein Match ist bereit",
        body: "Geh zu deinem Match im Turnier.",
        url: `/t/${tournamentId}/me`,
      },
    );
    if (res.ok) sent++;
    else if (res.gone) stale.push(s.id);
  }
  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }
  return { ok: true, sent };
}
