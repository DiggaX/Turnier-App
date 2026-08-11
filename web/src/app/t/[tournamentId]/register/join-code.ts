/**
 * Der Beitritts-Code eines Teams: Pruefung an der Grenze, und der Link, der ihn
 * transportiert.
 *
 * Die Datenbank vergibt sechs Zeichen aus einem Alphabet ohne I, O, 0 und 1
 * (`create_team`, 20260811093000_team_rpcs.sql) — damit ein vorgelesener Code
 * nicht an Verwechslungen scheitert.
 */
const JOIN_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * `?join=…` → sauberer Code oder `null`.
 *
 * Was ueber die URL hereinkommt, ist beliebiger Text: nur was exakt wie ein
 * Code aussieht, darf ins Eingabefeld. Ein Kind, dem ein halber Code
 * vorgesetzt wird, tippt ihn nicht nach — es drueckt auf „Team beitreten“ und
 * bekommt einen Fehler, den es sich nicht erklaeren kann.
 *
 * Grossbuchstaben, weil der Code ueberall gross angezeigt wird; `join_team`
 * selbst vergleicht schreibungsblind (`upper()` in der RPC), ein kleiner Code
 * im Link funktioniert also auch.
 *
 * Kommt der Parameter doppelt (`?join=a&join=b`), liefert Next ein Array — das
 * ist kein Code.
 */
export function normalizeJoinCode(
  raw: string | string[] | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return JOIN_CODE.test(code) ? code : null;
}

/**
 * Der Link hinter dem Beitritts-QR: dieselbe Anmeldeseite, nur mit dem Code im
 * Gepaeck. Absolut, weil ein QR nichts hat, wogegen er relativ sein koennte.
 *
 * Leer beim Serverrendern (dort gibt es kein `origin`) — dieselbe Regel wie bei
 * `participantRecoveryUrl` in components/qr-actions.
 */
export function teamJoinUrl(tournamentId: string, code: string): string {
  if (typeof window === "undefined") return "";
  const base = `${window.location.origin}/t/${tournamentId}/register`;
  return `${base}?join=${encodeURIComponent(code)}`;
}
