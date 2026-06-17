import { generateRoundRobin } from "@/lib/bracket/round-robin";
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";

/**
 * Number of groups for an entrant count: ceil(N/4) (target ~4 per group), but
 * at least 2 once we have enough players. Below 6 entrants groups->playoffs is
 * not meaningful, so 0 (the caller rejects it with a friendly message).
 */
export function groupCountFor(n: number): number {
  if (n < 6) return 0;
  return Math.max(2, Math.ceil(n / 4));
}

/**
 * Snake-distribute participants (sorted by seed) into `g` groups so group
 * strength is balanced: seeds 1..G go to groups 0..G-1, then the direction
 * reverses each pass (G+1 -> group G-1, G+2 -> group G-2, ...).
 */
export function assignGroups(
  participants: SeededParticipant[],
  g: number,
): SeededParticipant[][] {
  const sorted = [...participants].sort((a, b) => a.seed - b.seed);
  const groups: SeededParticipant[][] = Array.from({ length: g }, () => []);
  sorted.forEach((p, i) => {
    const pass = Math.floor(i / g);
    const pos = i % g;
    const target = pass % 2 === 0 ? pos : g - 1 - pos;
    groups[target].push(p);
  });
  return groups;
}

/**
 * Group stage: a round-robin within each group, every emitted match tagged with
 * its 0-based `groupNo`. `round` is the matchday within the group; `slot` is the
 * round-robin slot within that group's matchday. (Cross-group (round,slot) pairs
 * may repeat — harmless: views filter by `groupNo`, and group matches carry no
 * advancement links.)
 */
export function generateGroupStage(
  participants: SeededParticipant[],
  g: number,
): GeneratedMatch[] {
  const groups = assignGroups(participants, g);
  const out: GeneratedMatch[] = [];
  groups.forEach((members, groupNo) => {
    for (const m of generateRoundRobin(members)) {
      out.push({ ...m, groupNo });
    }
  });
  return out;
}
