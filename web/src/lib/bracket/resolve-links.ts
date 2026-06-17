import type { Bracket, GeneratedMatch } from "@/lib/bracket/types";

/**
 * Stable key for a match at a given (bracket, round, slot).
 *
 * Round/slot numbering restarts per bracket (winner / loser / grand_final), so
 * the bracket must be part of the key. Single-elimination and round-robin
 * matches all carry `bracket:"winner"`, so this generalizes cleanly: keying on
 * the triple still uniquely identifies each of their matches.
 */
export function roundSlotKey(
  bracket: Bracket,
  round: number,
  slot: number,
): string {
  return `${bracket}:${round}:${slot}`;
}

/**
 * Map every generated match's (bracket, round, slot) to the DB id assigned on
 * insert. Throws if any generated match is missing an id (would mean a botched
 * insert).
 */
export function buildIdMap(
  generated: GeneratedMatch[],
  inserted: { bracket: string; round: number; slot: number; id: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of inserted) {
    map.set(roundSlotKey(row.bracket as Bracket, row.round, row.slot), row.id);
  }
  for (const m of generated) {
    if (!map.has(roundSlotKey(m.bracket, m.round, m.slot))) {
      throw new Error(
        `Missing inserted match for ${m.bracket} round ${m.round}, slot ${m.slot}`,
      );
    }
  }
  return map;
}

/** An advancement-link update for one match row. */
export interface LinkUpdate {
  id: string;
  nextMatchId: string;
  nextSlot: "a" | "b";
}

/**
 * Resolve each generated match's `nextRef` (bracket/round/slot/side) into a
 * concrete row update: which DB id this match's WINNER feeds into and on which
 * side. Matches without a `nextRef` (e.g. the final, the grand final, or
 * round-robin matches) produce nothing.
 *
 * Pure: takes the id map from {@link buildIdMap}; performs no I/O.
 */
export function resolveLinkUpdates(
  generated: GeneratedMatch[],
  idMap: Map<string, string>,
): LinkUpdate[] {
  const updates: LinkUpdate[] = [];
  for (const m of generated) {
    if (!m.nextRef) continue;
    const id = idMap.get(roundSlotKey(m.bracket, m.round, m.slot));
    const nextMatchId = idMap.get(
      roundSlotKey(m.nextRef.bracket, m.nextRef.round, m.nextRef.slot),
    );
    if (!id || !nextMatchId) {
      throw new Error(
        `Cannot resolve link for ${m.bracket} round ${m.round}, slot ${m.slot}`,
      );
    }
    updates.push({ id, nextMatchId, nextSlot: m.nextRef.side });
  }
  return updates;
}

/** A loser-drop-link update for one match row (double elimination). */
export interface LoserLinkUpdate {
  id: string;
  loserNextMatchId: string;
  loserNextSlot: "a" | "b";
}

/**
 * Resolve each generated match's `loserRef` (bracket/round/slot/side) into a
 * concrete row update: which DB id this match's LOSER drops into and on which
 * side. Only winner-bracket matches in double elimination have a `loserRef`;
 * everything else produces nothing.
 *
 * Pure: takes the id map from {@link buildIdMap}; performs no I/O.
 */
export function resolveLoserLinkUpdates(
  generated: GeneratedMatch[],
  idMap: Map<string, string>,
): LoserLinkUpdate[] {
  const updates: LoserLinkUpdate[] = [];
  for (const m of generated) {
    if (!m.loserRef) continue;
    const id = idMap.get(roundSlotKey(m.bracket, m.round, m.slot));
    const loserNextMatchId = idMap.get(
      roundSlotKey(m.loserRef.bracket, m.loserRef.round, m.loserRef.slot),
    );
    if (!id || !loserNextMatchId) {
      throw new Error(
        `Cannot resolve loser link for ${m.bracket} round ${m.round}, slot ${m.slot}`,
      );
    }
    updates.push({ id, loserNextMatchId, loserNextSlot: m.loserRef.side });
  }
  return updates;
}

/** A participant injected into a downstream match because a bye auto-advanced. */
export interface ByeAdvance {
  /** DB id of the match the bye winner advances INTO. */
  nextMatchId: string;
  /** Which side the winner takes in that match. */
  nextSlot: "a" | "b";
  /** The auto-advancing participant. */
  winnerId: string;
}

/**
 * For each generated `bye` match that has both a winner and a `nextRef`, compute
 * the downstream injection: the bye winner already occupies its slot in the next
 * match, so byes advance immediately at generation time.
 *
 * Pure: returns the intended writes; the caller applies them.
 */
export function resolveByeAdvances(
  generated: GeneratedMatch[],
  idMap: Map<string, string>,
): ByeAdvance[] {
  const advances: ByeAdvance[] = [];
  for (const m of generated) {
    if (m.status !== "bye" || !m.winnerId || !m.nextRef) continue;
    const nextMatchId = idMap.get(
      roundSlotKey(m.nextRef.bracket, m.nextRef.round, m.nextRef.slot),
    );
    if (!nextMatchId) {
      throw new Error(
        `Cannot resolve bye advance for ${m.bracket} round ${m.round}, slot ${m.slot}`,
      );
    }
    advances.push({
      nextMatchId,
      nextSlot: m.nextRef.side,
      winnerId: m.winnerId,
    });
  }
  return advances;
}
