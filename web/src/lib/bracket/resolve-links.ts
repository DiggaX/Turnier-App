import type { GeneratedMatch } from "@/lib/bracket/types";

/** Stable key for a match at a given (round, slot). */
export function roundSlotKey(round: number, slot: number): string {
  return `${round}:${slot}`;
}

/**
 * Map every generated match's (round, slot) to the DB id assigned on insert.
 * Throws if any generated match is missing an id (would mean a botched insert).
 */
export function buildIdMap(
  generated: GeneratedMatch[],
  inserted: { round: number; slot: number; id: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of inserted) {
    map.set(roundSlotKey(row.round, row.slot), row.id);
  }
  for (const m of generated) {
    if (!map.has(roundSlotKey(m.round, m.slot))) {
      throw new Error(
        `Missing inserted match for round ${m.round}, slot ${m.slot}`,
      );
    }
  }
  return map;
}

/** A single-elim advancement-link update for one match row. */
export interface LinkUpdate {
  id: string;
  nextMatchId: string;
  nextSlot: "a" | "b";
}

/**
 * Resolve each generated match's `nextRef` (round/slot/side) into a concrete
 * row update: which DB id this match feeds into and on which side. Matches
 * without a `nextRef` (e.g. the final, or round-robin matches) produce nothing.
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
    const id = idMap.get(roundSlotKey(m.round, m.slot));
    const nextMatchId = idMap.get(
      roundSlotKey(m.nextRef.round, m.nextRef.slot),
    );
    if (!id || !nextMatchId) {
      throw new Error(
        `Cannot resolve link for round ${m.round}, slot ${m.slot}`,
      );
    }
    updates.push({ id, nextMatchId, nextSlot: m.nextRef.side });
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
      roundSlotKey(m.nextRef.round, m.nextRef.slot),
    );
    if (!nextMatchId) {
      throw new Error(
        `Cannot resolve bye advance for round ${m.round}, slot ${m.slot}`,
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
