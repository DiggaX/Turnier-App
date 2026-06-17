/** Minimal match shape needed to decide push targets. */
export interface NotifiableMatch {
  status: string;
  participantAId: string | null;
  participantBId: string | null;
}

/**
 * The set of participant ids to notify "your match is ready": both sides of
 * every PLAYABLE match — status `pending`/`live` with both slots filled.
 * De-duplicated across matches.
 */
export function participantsToNotify(
  matches: NotifiableMatch[],
): Set<string> {
  const out = new Set<string>();
  for (const mt of matches) {
    const playable =
      (mt.status === "pending" || mt.status === "live") &&
      mt.participantAId !== null &&
      mt.participantBId !== null;
    if (!playable) continue;
    out.add(mt.participantAId as string);
    out.add(mt.participantBId as string);
  }
  return out;
}
