/**
 * Wording for what a bracket regenerate would throw away.
 *
 * Regenerating deletes every match of the tournament. Two kinds of work can be
 * sitting in there: results already released by a referee, and matches being
 * counted right now — a scorekeeper mid-game loses just as much as a confirmed
 * round does.
 *
 * Shared by the server action (which refuses without confirmation) and the
 * button (which names the number in its dialog), so both say the same thing.
 */
export type LostWork = {
  /** e.g. "3 gespielte Ergebnisse und 1 laufendes Spiel" */
  label: string;
  /** Whether the label needs a plural verb ("werden" vs "wird"). */
  plural: boolean;
};

/** null when a regenerate costs nothing. */
export function lostWork(decided: number, live: number): LostWork | null {
  const parts: string[] = [];
  if (decided > 0) {
    parts.push(
      decided === 1 ? "1 gespieltes Ergebnis" : `${decided} gespielte Ergebnisse`,
    );
  }
  if (live > 0) {
    parts.push(live === 1 ? "1 laufendes Spiel" : `${live} laufende Spiele`);
  }
  if (parts.length === 0) return null;

  return { label: parts.join(" und "), plural: decided + live > 1 };
}
