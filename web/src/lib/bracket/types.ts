export interface SeededParticipant {
  id: string;
  seed: number; // seed 1..N, 1 = top
}

export interface GeneratedMatch {
  round: number;
  slot: number;
  participantAId: string | null;
  participantBId: string | null;
  winnerId: string | null; // set only for byes
  status: "pending" | "bye";
  // single-elim advancement link
  nextRef: { round: number; slot: number; side: "a" | "b" } | null;
}
