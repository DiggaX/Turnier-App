/**
 * Wer beim Generieren KEIN Match bekommt — und warum.
 *
 * `generateBracket` baut den Spielplan aus den eingecheckten WETTKAEMPFERN
 * (`type in ('solo','team')`, siehe HANDOVER §6). Zwei Sorten Zeilen fallen
 * dabei still heraus:
 *  - eingecheckte Menschen ohne Team (`type='player'`, `team_id` NULL) — sie
 *    sind keine Wettkaempfer, angetreten waere ihr Team,
 *  - Teams ohne Check-in — Wettkaempfer, aber nicht anwesend.
 * Live hat genau das zwoelf eingecheckte Kinder aus dem Turnier geworfen und
 * ein Zweier-Bracket erzeugt. Auf der Seite stand darueber kein Wort, und der
 * Spielplan selbst sieht danach voellig normal aus — deshalb muss der Satz VOR
 * dem Generieren fallen, nicht danach.
 *
 * Bewusst nur Text, kein Riegel: die Orga darf ohne die Genannten starten (das
 * Kind ist schon weg, das Team kommt nicht mehr). Deshalb Saetze, kein Fehler.
 *
 * Bewusst OHNE teamSize: der Ausweg unterscheidet sich zwar je nach Turnierart,
 * aber er steht schon im Restspieler-Panel direkt darueber. Hier zaehlt nur,
 * WER draussen bleibt — und das haengt an `type`/`team_id`/`checked_in_at`,
 * nicht an der Teamgroesse.
 */

/** Namen in Anzeigereihenfolge; die Seite laedt schon alphabetisch sortiert. */
export type GenerateWarningInput = {
  /** Eingecheckte Spieler ohne Team. */
  orphanNames: string[];
  /** Teams, die nicht eingecheckt sind. */
  notReadyTeamNames: string[];
};

/**
 * Ein ganzer Satz je Kategorie (Spieler zuerst), oder null wenn niemand
 * uebergangen wird. Ein Satz pro Kategorie statt Zahl + Liste getrennt: der
 * Grund und die Namen gehoeren zusammen, sonst liest sich die Liste wie eine
 * Teilnehmerliste.
 */
export function generateWarning({
  orphanNames,
  notReadyTeamNames,
}: GenerateWarningInput): string[] | null {
  const lines: string[] = [];

  if (orphanNames.length === 1) {
    lines.push(
      "Dieser eingecheckte Spieler steht in keiner Mannschaft und bekommt " +
        `KEIN Match: ${orphanNames[0]}`,
    );
  } else if (orphanNames.length > 1) {
    lines.push(
      `Diese ${orphanNames.length} eingecheckten Spieler stehen in keiner ` +
        `Mannschaft und bekommen KEIN Match: ${orphanNames.join(", ")}`,
    );
  }

  if (notReadyTeamNames.length === 1) {
    lines.push(
      "Dieses Team ist nicht spielbereit und wird übergangen: " +
        notReadyTeamNames[0],
    );
  } else if (notReadyTeamNames.length > 1) {
    lines.push(
      `Diese ${notReadyTeamNames.length} Teams sind nicht spielbereit und ` +
        `werden übergangen: ${notReadyTeamNames.join(", ")}`,
    );
  }

  return lines.length > 0 ? lines : null;
}
