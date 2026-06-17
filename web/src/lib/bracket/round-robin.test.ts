import { describe, it, expect } from "vitest";
import { generateRoundRobin } from "@/lib/bracket/round-robin";
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";

function participants(n: number): SeededParticipant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));
}

/** unordered-pair key, e.g. {p1,p3} -> "p1|p3" */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function assertRoundRobinShape(matches: GeneratedMatch[], n: number) {
  const total = (n * (n - 1)) / 2;
  expect(matches).toHaveLength(total);

  const seen = new Set<string>();
  for (const m of matches) {
    expect(m.status).toBe("pending");
    expect(m.winnerId).toBeNull();
    expect(m.nextRef).toBeNull();
    expect(m.loserRef).toBeNull();
    expect(m.bracket).toBe("winner");
    expect(m.participantAId).not.toBeNull();
    expect(m.participantBId).not.toBeNull();
    // no self-pair
    expect(m.participantAId).not.toBe(m.participantBId);

    const key = pairKey(m.participantAId!, m.participantBId!);
    // every unordered pair appears exactly once
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
  expect(seen.size).toBe(total);

  // slots are 0-based within each matchday
  const byRound = new Map<number, number[]>();
  for (const m of matches) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m.slot);
    byRound.set(m.round, arr);
  }
  for (const slots of byRound.values()) {
    const sorted = [...slots].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: slots.length }, (_, i) => i));
  }
}

describe("generateRoundRobin", () => {
  it("N=4: 6 matches across 3 rounds, every pair once, no self-pairs", () => {
    const matches = generateRoundRobin(participants(4));
    assertRoundRobinShape(matches, 4);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
  });

  it("N=3 (odd): 3 matches across 3 rounds", () => {
    const matches = generateRoundRobin(participants(3));
    assertRoundRobinShape(matches, 3);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(3);
  });

  it("N=5 (odd): 10 matches", () => {
    const matches = generateRoundRobin(participants(5));
    assertRoundRobinShape(matches, 5);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(5);
  });

  it("N=6: 15 matches", () => {
    const matches = generateRoundRobin(participants(6));
    assertRoundRobinShape(matches, 6);
    const rounds = new Set(matches.map((m) => m.round));
    expect(rounds.size).toBe(5);
  });

  it("N=2: single match", () => {
    const matches = generateRoundRobin(participants(2));
    assertRoundRobinShape(matches, 2);
  });

  it("N=1: no matches", () => {
    expect(generateRoundRobin(participants(1))).toEqual([]);
  });
});
