/**
 * Eine Spielerzeile, wie sie BEIDE Seiten liefern: die oeffentliche Seite ueber
 * die RPC `get_team_rosters`, die Organizer-Seite direkt per Staff-Query.
 */
export type RosterRow = {
  team_id: string | null;
  display_name: string;
  is_captain: boolean | null;
};

/**
 * Gruppiert Spielerzeilen zu „Team-Id → fertige Zeile", Kapitaen zuerst und mit
 * „(C)" markiert, z. B. `"Niki (C) · Anna · Tom"`.
 *
 * Sortiert wird hier NICHT: der Kapitaen wird nach vorne gezogen (`unshift`),
 * alle uebrigen behalten die Reihenfolge, in der sie ankommen — also die des
 * order-by der jeweiligen Abfrage (created_at, Anmeldereihenfolge). Mehrere
 * Kapitaene stehen entsprechend in umgekehrter Ankunftsreihenfolge vorn.
 * Der `unshift` genuegt trotzdem: die beiden Aufrufer holen ihre Zeilen auf
 * verschiedenen Wegen (RPC bzw. PostgREST), und dass der Kapitaen vorne steht,
 * soll nicht daran haengen, dass beide Wege dasselbe `is_captain desc` im
 * order-by mitfuehren — „still verloren" hiesse hier: der Kapitaen steht
 * irgendwo in der Mitte und niemandem faellt es auf.
 *
 * Spieler ohne Team fallen raus: sie stehen in keiner Mannschaft, also auch in
 * keiner Aufstellung.
 */
export function teamRosterLines(rows: RosterRow[]): Map<string, string> {
  const namesByTeam = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.team_id) continue;
    const names = namesByTeam.get(row.team_id) ?? [];
    if (row.is_captain) names.unshift(`${row.display_name} (C)`);
    else names.push(row.display_name);
    namesByTeam.set(row.team_id, names);
  }
  return new Map(
    [...namesByTeam].map(([teamId, names]) => [teamId, names.join(" · ")]),
  );
}
