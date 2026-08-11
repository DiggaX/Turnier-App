"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveAssignments } from "../teams/actions";

/** Ein Team, in das vom Tresen aus zugeordnet werden kann. */
export type AssignTeamOption = { id: string; name: string; memberCount: number };

/** Leerwert des <select>: „raus aus dem Team" bzw. „noch nichts gewaehlt". */
const NO_TEAM = "";

/**
 * Zuordnung direkt aus der Teilnehmerliste — fuer das Kind ohne Handy, das
 * angemeldet ist, kein Team hat und jetzt vor der Orga steht.
 *
 * Geschrieben wird ueber saveAssignments, dieselbe Aktion wie auf dem
 * Teams-Screen: sie prueft Spieler und Team gegen das Turnier, raeumt das
 * Captain-Kennzeichen weg und meldet ein dadurch vollzaehliges Team
 * spielbereit. Ein kurzer eigener Update-Weg an ihr vorbei wuerde genau diese
 * drei Dinge vergessen — und das dritte ist der Grund, warum ein Team spaeter
 * nicht im Bracket steht.
 */
export function AssignTeamSelect({
  tournamentId,
  playerId,
  playerName,
  currentTeamId,
  teams,
  teamSize,
}: {
  tournamentId: string;
  playerId: string;
  playerName: string;
  currentTeamId: string | null;
  teams: AssignTeamOption[];
  teamSize: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Gibt es keine Mannschaft, ist auch nichts zu waehlen — dann steht hier
  // lieber nichts als ein leeres Auswahlfeld.
  if (teams.length === 0) return null;

  function assign(value: string) {
    const teamId = value === NO_TEAM ? null : value;
    if (teamId === currentTeamId) return;
    setError(null);
    startTransition(async () => {
      const result = await saveAssignments(tournamentId, [{ playerId, teamId }]);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <select
        // Pro Zeile ein eigener Name: „Team zuordnen" allein saehe fuer einen
        // Screenreader in jeder Zeile gleich aus.
        aria-label={`${playerName} einem Team zuordnen`}
        value={currentTeamId ?? NO_TEAM}
        onChange={(e) => assign(e.target.value)}
        disabled={pending}
        className="max-w-[10rem] rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-fg-muted disabled:opacity-50"
      >
        {/* Herausnehmen kann nur, wer drin ist. Fuer ein Kind ohne Team waere
            „kein Team" keine Handlung, sondern nur der Platzhalter. */}
        <option value={NO_TEAM}>
          {currentTeamId ? "— kein Team —" : "Team wählen…"}
        </option>
        {/* Der Stand steht dabei wie im Restspieler-Panel und im
            Nachmelde-Formular: ohne ihn waehlt der Tresen blind und stopft das
            Kind in ein Team, das schon voll ist — abgelehnt wird das erst beim
            Absenden. */}
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name} ({team.memberCount}/{teamSize})
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-fg-dim">Wird zugeordnet…</span>}
      {error && (
        <span className="text-xs text-live" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
