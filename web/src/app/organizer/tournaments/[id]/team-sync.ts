/**
 * Spieler in ein Team umhaengen — und das Team danach spielbereit melden.
 *
 * ⚠️ DIESE DATEI TRAEGT BEWUSST KEIN "use server". In einem "use server"-Modul
 * wird JEDER Export zu einem oeffentlich aufrufbaren Endpunkt. Die beiden
 * Funktionen hier haben keinen eigenen Auth-Guard — sie bekommen den bereits
 * geprueften Client der aufrufenden Action uebergeben. Als Server Actions waeren
 * sie genau das: ein ungeschuetztes Schreibrecht auf team_id und checked_in_at.
 * Geteilt wird der Code, nicht die Tuer.
 *
 * Aufrufer: bracket/free-agent-actions.ts (Restspieler zuordnen) und
 * teams/actions.ts (gezogene Zuordnung speichern). Beide Wege veraendern die
 * Zusammensetzung eines Teams, also braucht auch jeder von beiden den Nachzug
 * unten — vorher hatte ihn nur einer.
 */
// Zweiter Riegel neben dem fehlenden "use server": laesst den Build platzen,
// falls diese Datei je in einem Client-Bundle landet — wie in lib/auth/staff.ts.
import "server-only";

import type { requireStaff } from "@/lib/auth/staff";
import { friendlyDbError } from "@/lib/db-errors";

type ActionResult = { ok: true } | { error: string };

type Supabase = Extract<
  Awaited<ReturnType<typeof requireStaff>>,
  { supabase: unknown }
>["supabase"];

/**
 * Ein vollzaehliges Team spielbereit melden.
 *
 * Der Trigger sync_team_ready macht das sonst von selbst — er feuert aber nur,
 * wenn sich die ANWESENHEIT einer Person aendert, und hier aendert sich nur ihr
 * Team. Ohne diesen Nachzug bleibt ein Team, das gerade aus lauter anwesenden
 * Spielern vervollstaendigt wurde, mit checked_in_at NULL zurueck:
 * generateBracket uebergeht es, und nirgends steht, warum. Genau dieser
 * Mechanismus hat das laufende Turnier zerlegt. Dieselbe Bedingung wie im
 * Trigger, damit beide Wege dasselbe bedeuten.
 *
 * Gibt null zurueck, wenn nichts zu tun war — ein Fehlerobjekt reicht der
 * Aufrufer unveraendert nach oben durch.
 */
export async function syncTeamReady(
  supabase: Supabase,
  tournamentId: string,
  teamId: string,
  teamSize: number,
): Promise<ActionResult | null> {
  if (teamSize < 2) return null;

  const { data: members, error: memberErr } = await supabase
    .from("participants")
    .select("id, checked_in_at")
    .eq("tournament_id", tournamentId)
    .eq("team_id", teamId);
  if (memberErr) {
    return { error: friendlyDbError(memberErr, "Spielbereitschaft konnte nicht geprüft werden.") };
  }
  const present = (members ?? []).filter((m) => m.checked_in_at !== null).length;
  if (present < teamSize) return null;

  // `is("checked_in_at", null)` wie im Trigger: eine von Hand gesetzte
  // Freigabe (Team tritt unvollzaehlig an) bekommt keinen neuen Zeitstempel.
  const { error } = await supabase
    .from("participants")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .is("checked_in_at", null);
  if (error) {
    return { error: friendlyDbError(error, "Team konnte nicht spielbereit gemeldet werden.") };
  }
  return null;
}

/**
 * Spieler in ein Team umhaengen. `withCaptain` macht den ersten zum Captain —
 * ein frisch gebildetes Team hat sonst keinen, und ohne Captain kann es sich
 * spaeter nicht selbst umbenennen oder aufloesen.
 */
export async function moveInto(
  supabase: Supabase,
  tournamentId: string,
  teamId: string,
  playerIds: string[],
  withCaptain: boolean,
): Promise<ActionResult | null> {
  const { error } = await supabase
    .from("participants")
    .update({ team_id: teamId })
    .eq("tournament_id", tournamentId)
    .in("id", playerIds);
  if (error) {
    return { error: friendlyDbError(error, "Zuordnung konnte nicht gespeichert werden.") };
  }
  if (withCaptain) {
    const { error: capErr } = await supabase
      .from("participants")
      .update({ is_captain: true })
      .eq("tournament_id", tournamentId)
      .eq("id", playerIds[0]);
    if (capErr) {
      return { error: friendlyDbError(capErr, "Captain konnte nicht gesetzt werden.") };
    }
  }
  return null;
}
