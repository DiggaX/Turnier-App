/**
 * Restspieler: Menschen, die sich angemeldet haben, aber in keinem Team stehen
 * — und Teams, denen Spieler fehlen. Beides steht dem Turnierstart im Weg, und
 * beides faellt erst kurz vorher auf. Diese Datei rechnet nur; sie schlaegt
 * eine Zuordnung VOR. Entschieden wird oben in der UI von der Orga.
 */

/** Ein Mensch ohne Team (participants: type='player', team_id NULL). */
export type FreeAgent = { id: string; name: string };

/** Ein Team mit der Zahl seiner aktuellen Mitglieder. */
export type TeamSlot = { id: string; name: string; memberCount: number };

/** Zielschluessel „kein Team" — der Spieler bleibt, wo er ist. */
export const NO_TEAM = "";

/** Zielschluessel fuer ein neu zu bildendes Team (Index ab 0). */
export function newTeamKey(index: number): string {
  return `new:${index}`;
}

/** Index aus einem `new:<n>`-Schluessel, oder null wenn es keiner ist. */
export function newTeamIndex(key: string): number | null {
  const m = /^new:(\d+)$/.exec(key);
  return m ? Number(m[1]) : null;
}

/** Teams, denen noch Spieler fehlen. */
export function incompleteTeams(
  teams: TeamSlot[],
  teamSize: number,
): TeamSlot[] {
  return teams.filter((t) => t.memberCount < teamSize);
}

/**
 * Vorschlag: erst die Luecken in bestehenden Teams fuellen, dann aus dem Rest
 * neue Teams bilden.
 *
 * Die Luecken werden nach „fehlt am wenigsten" zuerst gefuellt, damit moeglichst
 * viele Teams spielfaehig werden statt alle halbvoll zu bleiben. Bleibt am Ende
 * weniger als ein volles Team uebrig, bleiben diese Spieler bewusst ohne Team:
 * ein Dreier-Team in einem 5er-Turnier waere kein Vorschlag, sondern ein
 * Problem mit Uhrzeit.
 *
 * Rueckgabe: playerId -> Zielschluessel (Team-Id, `new:<n>` oder NO_TEAM).
 */
export function suggestAssignments(
  teams: TeamSlot[],
  freeAgents: FreeAgent[],
  teamSize: number,
): Record<string, string> {
  const plan: Record<string, string> = {};
  for (const a of freeAgents) plan[a.id] = NO_TEAM;
  if (teamSize < 2 || freeAgents.length === 0) return plan;

  const gaps = incompleteTeams(teams, teamSize)
    .map((t) => ({ id: t.id, missing: teamSize - t.memberCount, name: t.name }))
    // Nach fehlenden Spielern, bei Gleichstand nach Name — damit derselbe
    // Bestand immer denselben Vorschlag ergibt.
    .sort((a, b) => a.missing - b.missing || a.name.localeCompare(b.name, "de"));

  const pool = [...freeAgents];
  for (const gap of gaps) {
    for (let i = 0; i < gap.missing && pool.length > 0; i++) {
      plan[pool.shift()!.id] = gap.id;
    }
  }

  // Aus dem Rest volle Teams bilden; ein angebrochenes bleibt ungebunden.
  let newIndex = 0;
  while (pool.length >= teamSize) {
    const key = newTeamKey(newIndex++);
    for (let i = 0; i < teamSize; i++) plan[pool.shift()!.id] = key;
  }

  return plan;
}
