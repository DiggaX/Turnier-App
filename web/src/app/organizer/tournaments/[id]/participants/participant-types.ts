import type { ParticipantType } from "@/lib/database.types";

export const TYPE_LABELS: Record<string, string> = {
  solo: "Solo",
  team: "Team",
  player: "Spieler",
};

/**
 * In participants stehen zwei Sorten Zeilen: Wettkaempfer (was im Spielplan
 * steht) und Menschen (wer eine Person ist). Jede Abfrage muss sagen, welche
 * sie meint — sonst laufen 16 Kinder in ein Bracket, das 4 Teams erwartet, und
 * ihre Klarnamen haengen im oeffentlichen Board.
 *
 * Unterschieden wird ueber type, NIE ueber team_id: ein Spieler ohne Team und
 * ein Spieler, dessen Team geloescht wurde, haben beide team_id NULL — an
 * team_id aufgehaengt stuenden genau diese Menschen im Turnierbaum.
 */

/** Steht im Spielplan: Einzelstarter und Team-Zeilen. */
export const COMPETITOR_TYPES: ParticipantType[] = ["solo", "team"];

/** Ist ein Mensch: Einzelstarter und Team-Mitglieder. */
export const PERSON_TYPES: ParticipantType[] = ["solo", "player"];
