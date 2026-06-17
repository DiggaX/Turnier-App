import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";
import { pairSwissRound } from "@/lib/swiss/pairing";

/**
 * Round 1 of a Swiss tournament: pair players in seed order (no history yet, so
 * `pairSwissRound` produces adjacent pairings 1v2, 3v4, …). An odd entrant count
 * yields a bye row that is already decided (`status:'bye'`, `winnerId` = the
 * bye player) so the existing insert pipeline persists it as a free win.
 */
export function generateSwissRoundOne(
  participants: SeededParticipant[],
): GeneratedMatch[] {
  const ids = [...participants]
    .sort((a, b) => a.seed - b.seed)
    .map((p) => p.id);
  if (ids.length < 2) return [];

  const { pairings, bye } = pairSwissRound(ids, new Set(), new Set());

  const matches: GeneratedMatch[] = [];
  let slot = 0;
  for (const [a, b] of pairings) {
    matches.push({
      bracket: "winner",
      round: 1,
      slot,
      participantAId: a,
      participantBId: b,
      winnerId: null,
      status: "pending",
      nextRef: null,
      loserRef: null,
    });
    slot++;
  }
  if (bye) {
    matches.push({
      bracket: "winner",
      round: 1,
      slot,
      participantAId: bye,
      participantBId: null,
      winnerId: bye,
      status: "bye",
      nextRef: null,
      loserRef: null,
    });
  }
  return matches;
}
