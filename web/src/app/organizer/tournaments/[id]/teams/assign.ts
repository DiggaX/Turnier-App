/**
 * Who lands in which team — the whole rule set of the teams screen, kept apart
 * from the component.
 *
 * Dragging is only one of the ways a player moves; the <select> next to every
 * row does the same thing, and both go through here. Pulling it out means the
 * rules can be checked without a pointer device, which jsdom does not have.
 */

/** Where one player currently sits. `teamId` null means "Ohne Team". */
export type Assignment = { playerId: string; teamId: string | null };

/**
 * How full a team is. `over` exists because the orga is allowed to overfill —
 * she has the full picture at the desk. It is shown, not prevented.
 */
export type FillState = "empty" | "under" | "full" | "over";

export type Fill = { count: number; teamSize: number; state: FillState };

/**
 * Move `playerId` into `teamId` (null = out of every team).
 *
 * Returns the same array when nothing changes so React can skip a render, and
 * silently ignores an unknown player — a stale drop after a refresh must not
 * invent a row.
 */
export function assignPlayer(
  assignments: Assignment[],
  playerId: string,
  teamId: string | null,
): Assignment[] {
  let changed = false;
  const next = assignments.map((a) => {
    if (a.playerId !== playerId || a.teamId === teamId) return a;
    changed = true;
    return { playerId, teamId };
  });
  return changed ? next : assignments;
}

/** Player ids currently sitting in `teamId` (null = the "Ohne Team" column). */
export function membersOf(
  assignments: Assignment[],
  teamId: string | null,
): string[] {
  return assignments.filter((a) => a.teamId === teamId).map((a) => a.playerId);
}

/** Headcount of a team plus the marker the card renders. */
export function fillFor(
  assignments: Assignment[],
  teamId: string,
  teamSize: number,
): Fill {
  const count = membersOf(assignments, teamId).length;
  const state: FillState =
    count === 0
      ? "empty"
      : count < teamSize
        ? "under"
        : count === teamSize
          ? "full"
          : "over";
  return { count, teamSize, state };
}

/**
 * The flat array the save action receives: only the rows whose team actually
 * differs from what the server handed us. Sending the untouched ones would
 * clear their captain flag for nothing (see saveAssignments).
 */
export function pendingChanges(
  original: Assignment[],
  current: Assignment[],
): Assignment[] {
  const before = new Map(original.map((a) => [a.playerId, a.teamId]));
  return current.filter((a) => before.get(a.playerId) !== a.teamId);
}
