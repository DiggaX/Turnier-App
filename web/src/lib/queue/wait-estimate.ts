import type { MatchStatus } from "@/lib/database.types";

/**
 * Ein Match, reduziert auf das, was die Warteschlange davon braucht.
 * Bewusst ohne Namen und Scores — das hier ist reine Rechnung.
 */
export interface QueueMatch {
  id: string;
  round: number;
  slot: number;
  status: MatchStatus;
  participantAId: string | null;
  participantBId: string | null;
}

/** Wie schnell das Turnier Partien abarbeitet (steht auf `tournaments`). */
export interface Pacing {
  /** Angenommene Dauer je Partie in Minuten. */
  matchDurationMin: number;
  /** Wieviele Partien gleichzeitig gespielt werden koennen. */
  parallelStations: number;
}

/** Wo der Spieler gerade steht. */
export type QueueStatus =
  /** Keine offene eigene Partie (noch nicht ausgelost oder alles gespielt). */
  | { kind: "none" }
  /** Die eigene Partie laeuft — keine Schaetzung, sondern eine Ansage. */
  | { kind: "live"; matchId: string }
  /** Nichts mehr davor. */
  | { kind: "next"; matchId: string }
  | { kind: "waiting"; matchId: string; ahead: number; minutes: number };

/**
 * Zaehlt eine Partie fuer die Warteschlange? Nur wenn sie noch gespielt werden
 * muss UND beide Seiten feststehen. Ein halb leeres Match (der Gegner kommt
 * erst aus einer frueheren Runde) belegt keine Station und darf die Schaetzung
 * nicht aufblasen.
 */
export function isOpen(m: QueueMatch): boolean {
  return (
    (m.status === "pending" || m.status === "live") &&
    m.participantAId !== null &&
    m.participantBId !== null
  );
}

/** Die Reihenfolge, in der gespielt wird: Runde, dann Slot. */
export function compareQueueOrder(a: QueueMatch, b: QueueMatch): number {
  if (a.round !== b.round) return a.round - b.round;
  if (a.slot !== b.slot) return a.slot - b.slot;
  // Stabiler Tiebreak, damit "davor" bei gleicher Runde+Slot deterministisch ist.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Steht dieser Wettkaempfer in dieser Partie? */
export function isMine(m: QueueMatch, competitorId: string): boolean {
  return m.participantAId === competitorId || m.participantBId === competitorId;
}

/**
 * Die naechste eigene Partie: die frueheste offene, in der man selbst steht.
 * `null`, wenn keine offen ist.
 */
export function findNextOwnMatch(
  matches: QueueMatch[],
  competitorId: string,
): QueueMatch | null {
  return (
    matches
      .filter((m) => isOpen(m) && isMine(m, competitorId))
      .sort(compareQueueOrder)[0] ?? null
  );
}

/**
 * Wieviele offene Partien liegen vor dieser hier.
 *
 * Laufende Partien werden MITGEZAEHLT. Sie belegen gerade eine Station, und
 * bevor die nicht frei ist, faengt nichts Neues an — sie wegzulassen wuerde die
 * Wartezeit systematisch zu kurz schaetzen. Dass eine laufende Partie schon
 * halb vorbei ist, macht die Schaetzung leicht zu lang; das ist die Richtung,
 * in der man sich irren will.
 */
export function countAhead(matches: QueueMatch[], target: QueueMatch): number {
  return matches.filter(
    (m) => m.id !== target.id && isOpen(m) && compareQueueOrder(m, target) < 0,
  ).length;
}

/**
 * Partien davor -> Minuten. Bei mehr Stationen als Partien davor bleibt genau
 * eine Runde uebrig, weil alle gleichzeitig laufen.
 */
export function estimateWaitMinutes(ahead: number, pacing: Pacing): number {
  const stations = Math.max(1, Math.floor(pacing.parallelStations) || 1);
  const duration = Math.max(0, Math.floor(pacing.matchDurationMin) || 0);
  return Math.ceil(Math.max(0, ahead) / stations) * duration;
}

/** Alles zusammen: wo steht dieser Wettkaempfer in der Warteschlange. */
export function queueStatus(
  matches: QueueMatch[],
  competitorId: string,
  pacing: Pacing,
): QueueStatus {
  const next = findNextOwnMatch(matches, competitorId);
  if (!next) return { kind: "none" };
  if (next.status === "live") return { kind: "live", matchId: next.id };

  const ahead = countAhead(matches, next);
  if (ahead === 0) return { kind: "next", matchId: next.id };

  return {
    kind: "waiting",
    matchId: next.id,
    ahead,
    minutes: estimateWaitMinutes(ahead, pacing),
  };
}

/** Der Satz, den der Spieler liest. */
export function queueLabel(status: QueueStatus): string {
  switch (status.kind) {
    case "none":
      return "Für dich steht gerade keine Partie an.";
    case "live":
      return "Deine Partie läuft gerade.";
    case "next":
      return "Du bist als Nächstes dran!";
    case "waiting": {
      const games =
        status.ahead === 1 ? "Noch 1 Spiel vor dir" : `Noch ${status.ahead} Spiele vor dir`;
      // Ohne hinterlegte Dauer waere "ungefähr 0 Minuten" schlicht gelogen.
      return status.minutes > 0
        ? `${games} — ungefähr ${status.minutes} Minuten`
        : games;
    }
  }
}
