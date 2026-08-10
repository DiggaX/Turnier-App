/**
 * Wording for what a bracket regenerate would throw away.
 *
 * Regenerating deletes every match of the tournament. Three kinds of work can
 * be sitting in there:
 *  - results already released by a referee,
 *  - matches being counted right now — a scorekeeper mid-game loses just as
 *    much as a confirmed round does,
 *  - matches still `pending` that players have already reported. Those reports
 *    hang off the match id with `on delete cascade`, so they vanish with it,
 *    and nothing about the match's status hints that anything was there.
 *
 * Shared by the server action (which refuses without confirmation) and the
 * button (which names it in the dialog), so both say the same thing.
 */
export type LostWork = {
  /** e.g. "3 gespielte Ergebnisse und 1 laufendes Spiel" */
  label: string;
  /** Whether the label needs a plural verb ("werden" vs "wird"). */
  plural: boolean;
};

/** "a", "a und b", "a, b und c" */
function joinGerman(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return parts.slice(0, -1).join(", ") + " und " + parts[parts.length - 1];
}

/** null when a regenerate costs nothing. */
export function lostWork(
  decided: number,
  live: number,
  reported = 0,
): LostWork | null {
  const parts: string[] = [];
  if (decided > 0) {
    parts.push(
      decided === 1 ? "1 gespieltes Ergebnis" : `${decided} gespielte Ergebnisse`,
    );
  }
  if (live > 0) {
    parts.push(live === 1 ? "1 laufendes Spiel" : `${live} laufende Spiele`);
  }
  if (reported > 0) {
    parts.push(
      reported === 1
        ? "1 gemeldetes Ergebnis ohne Freigabe"
        : `${reported} gemeldete Ergebnisse ohne Freigabe`,
    );
  }
  if (parts.length === 0) return null;

  return {
    label: joinGerman(parts),
    plural: decided + live + reported > 1,
  };
}
