export interface SeededParticipant {
  id: string;
  seed: number; // seed 1..N, 1 = top
}

/** Which sub-bracket a match belongs to (double-elim aware). */
export type Bracket = "winner" | "loser" | "grand_final";

/**
 * A reference to a target match slot. `round`/`slot` are scoped to `bracket`
 * (round/slot numbering restarts per bracket), so resolution must key on the
 * full `(bracket, round, slot)` triple, then pick `side` ("a"/"b").
 */
export interface MatchRef {
  bracket: Bracket;
  round: number;
  slot: number;
  side: "a" | "b";
}

export interface GeneratedMatch {
  bracket: Bracket;
  round: number;
  slot: number;
  participantAId: string | null;
  participantBId: string | null;
  winnerId: string | null; // set only for byes
  status: "pending" | "bye";
  // Where the WINNER of this match advances to (null = no onward match).
  nextRef: MatchRef | null;
  // Where the LOSER of this match drops to (null = eliminated / not applicable).
  loserRef: MatchRef | null;
  // Group-stage tag (groups->playoffs). null/undefined for every other format
  // and for the playoff bracket itself.
  groupNo?: number | null;
}
