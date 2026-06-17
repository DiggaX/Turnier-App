# Swiss System Implementation Plan (Plan 8 — Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The generator supports the **Swiss** format — `N` players, `R = ceil(log2(N))` rounds, each round pairs similarly-scored players who have **not** met before; nobody is eliminated; an odd entrant count gives one player a **bye** (free win). The organizer generates round 1, plays it through the existing report/confirm flow, then **advances** to the next round (the server computes pairings from the live standings) until all `R` rounds are played. The final standings decide the winner. WB/board show a standings table + per-round schedule.

**Architecture:** Swiss is generated **round-by-round** because round `k+1`'s pairings depend on round `k`'s results. It reuses the existing `matches` table (`round`, `slot`, `status`, `score_a`, `score_b`, `winner_id`), the `report_match`/`confirm_match` RPCs (a Swiss match has no `next_match_id`, so confirm just records the result — no code change), and `computeStandings`. New code is purely additive: a pure `pairSwissRound` (TDD), a pure `swissStandings` (TDD, byes count as a win), a `generateSwissRoundOne` wired into `generateBracket`, and a new `advanceSwissRound` server action. Views reuse `StandingsTable` + a new `SwissView`.

**No database migration.** The `tournament_format` enum already includes `'swiss'` (declared in `20260616120000_base_schema.sql`) and `matches`/`match_status` already support byes (`status='bye'`, nullable `participant_b_id`) — single-elim already emits them. This plan is application code only.

**Tech Stack:** Next.js 16 (App Router, `web/`) · Supabase (Postgres, RPC) · pure TS generator (Vitest) · Playwright. Read `node_modules/next/dist/docs/` before writing Next code (this is Next 16, not your training-data Next).

---

## Prerequisites — manual dashboard steps
**None.** No migration to apply. (Confirm once after Task 1: anon `select format from tournaments limit 0` already accepts `'swiss'` — it's an existing enum value.)

---

## Task 1: Types + label for `swiss`

**Files:**
- Modify: `web/src/lib/database.types.ts:10-13` (the `TournamentFormat` union)
- Modify: `web/src/lib/labels.ts` (`formatLabel`)

- [ ] **Step 1: Add `swiss` to the `TournamentFormat` union.** It currently lists three of the five DB enum values; add `swiss` (leave `groups_playoffs` for Plan 9).

```ts
export type TournamentFormat =
  | "single_elim"
  | "round_robin"
  | "double_elim"
  | "swiss";
```

- [ ] **Step 2: Add the German label.** In `web/src/lib/labels.ts`, find `formatLabel` and add the `swiss` case so it returns `"Swiss-System"`. (Match the existing switch/record style in that file — read it first; if it's a `Record<TournamentFormat,string>` add the key, if a `switch` add a `case`.)

- [ ] **Step 3: Build.**

Run: `cd web && npm run build`
Expected: PASS (no type errors — every `TournamentFormat` switch that must stay exhaustive now compiles; if a `switch` over format becomes non-exhaustive, that's caught here).

- [ ] **Step 4: Commit.**

```bash
git add web/src/lib/database.types.ts web/src/lib/labels.ts
git commit -m "feat: swiss format type + label"
```

## Task 2: Pure Swiss pairing + round count (TDD) — the core

**Files:**
- Create: `web/src/lib/swiss/pairing.ts`
- Test: `web/src/lib/swiss/pairing.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { pairKey, pairSwissRound, swissRoundCount } from "./pairing";

describe("swissRoundCount", () => {
  it("is ceil(log2(N)), min 1 for N>=2, and 0 below", () => {
    expect(swissRoundCount(1)).toBe(0);
    expect(swissRoundCount(2)).toBe(1);
    expect(swissRoundCount(4)).toBe(2);
    expect(swissRoundCount(5)).toBe(3);
    expect(swissRoundCount(8)).toBe(3);
    expect(swissRoundCount(16)).toBe(4);
  });
});

describe("pairKey", () => {
  it("is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
  });
});

describe("pairSwissRound", () => {
  const empty = () => new Set<string>();

  it("pairs adjacent ranked players with no history (even N)", () => {
    const { pairings, bye } = pairSwissRound(
      ["p1", "p2", "p3", "p4"],
      empty(),
      empty(),
    );
    expect(bye).toBeNull();
    expect(pairings).toEqual([
      ["p1", "p2"],
      ["p3", "p4"],
    ]);
  });

  it("gives the lowest-ranked bye-less player a bye (odd N)", () => {
    const { pairings, bye } = pairSwissRound(
      ["p1", "p2", "p3"],
      empty(),
      empty(),
    );
    expect(bye).toBe("p3");
    expect(pairings).toEqual([["p1", "p2"]]);
  });

  it("skips a player who already had a bye when choosing the new bye", () => {
    const { pairings, bye } = pairSwissRound(
      ["p1", "p2", "p3"],
      empty(),
      new Set(["p3"]),
    );
    expect(bye).toBe("p2");
    expect(pairings).toEqual([["p1", "p3"]]);
  });

  it("avoids rematches by pairing the next un-played opponent", () => {
    const played = new Set([pairKey("p1", "p2"), pairKey("p3", "p4")]);
    const { pairings } = pairSwissRound(
      ["p1", "p2", "p3", "p4"],
      played,
      new Set(),
    );
    expect(pairings).toEqual([
      ["p1", "p3"],
      ["p2", "p4"],
    ]);
  });

  it("falls back to a rematch when no fresh opponent remains", () => {
    const played = new Set([pairKey("p1", "p2")]);
    const { pairings, bye } = pairSwissRound(["p1", "p2"], played, new Set());
    expect(bye).toBeNull();
    expect(pairings).toEqual([["p1", "p2"]]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `cd web && npx vitest run src/lib/swiss/pairing.test.ts`
Expected: FAIL ("Cannot find module './pairing'").

- [ ] **Step 3: Implement.**

```ts
/** Order-independent key for the unordered pair {a,b}. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Standard Swiss round count: ceil(log2(N)), at least 1 for N>=2, else 0. */
export function swissRoundCount(n: number): number {
  if (n < 2) return 0;
  return Math.max(1, Math.ceil(Math.log2(n)));
}

export interface SwissPairing {
  /** Ordered [higher-ranked, lower-ranked] pairs for the next round. */
  pairings: Array<[string, string]>;
  /** The player receiving a bye this round, or null when N is even. */
  bye: string | null;
}

/**
 * Compute one Swiss round's pairings from a ranked list (best first).
 *
 * - Odd count: the LOWEST-ranked player who has not had a bye yet receives one
 *   (searched bottom-up; if everyone already had a bye, the very last player).
 * - Pairing is greedy from the top: each still-unpaired player is matched to the
 *   next unpaired player below them whom they have NOT already played; if every
 *   remaining opponent is a rematch, the closest one is used (rematch fallback).
 *
 * `played` holds `pairKey` of every pairing already contested; `byeHistory`
 * holds every player who has already had a bye.
 */
export function pairSwissRound(
  ranked: string[],
  played: Set<string>,
  byeHistory: Set<string>,
): SwissPairing {
  const pool = [...ranked];
  let bye: string | null = null;

  if (pool.length % 2 === 1) {
    let byeIdx = pool.length - 1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!byeHistory.has(pool[i])) {
        byeIdx = i;
        break;
      }
    }
    bye = pool[byeIdx];
    pool.splice(byeIdx, 1);
  }

  const pairings: Array<[string, string]> = [];
  const used = new Array<boolean>(pool.length).fill(false);

  for (let i = 0; i < pool.length; i++) {
    if (used[i]) continue;
    used[i] = true;

    let oppIdx = -1;
    let fallbackIdx = -1;
    for (let j = i + 1; j < pool.length; j++) {
      if (used[j]) continue;
      if (fallbackIdx === -1) fallbackIdx = j;
      if (!played.has(pairKey(pool[i], pool[j]))) {
        oppIdx = j;
        break;
      }
    }

    const chosen = oppIdx !== -1 ? oppIdx : fallbackIdx;
    if (chosen === -1) break; // even pool guarantees this never trips
    used[chosen] = true;
    pairings.push([pool[i], pool[chosen]]);
  }

  return { pairings, bye };
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `cd web && npx vitest run src/lib/swiss/pairing.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/swiss/pairing.ts web/src/lib/swiss/pairing.test.ts
git commit -m "feat: pure swiss pairing + round count with tests"
```

## Task 3: Swiss standings (TDD) — byes count as a win

**Files:**
- Create: `web/src/lib/swiss/standings.ts`
- Test: `web/src/lib/swiss/standings.test.ts`

Reuse `computeStandings` (head-to-head tallies) from `@/lib/standings`, then layer in byes (+1 win, +1 played, no score change), and re-sort with a deterministic final tiebreak so the ranked order fed to pairing is stable.

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import type { DoneMatch } from "@/lib/standings";
import { swissStandings } from "./standings";

describe("swissStandings", () => {
  it("ranks by wins, then diff, then scoreFor", () => {
    const done: DoneMatch[] = [
      { participantAId: "p1", participantBId: "p2", scoreA: 2, scoreB: 0 },
      { participantAId: "p3", participantBId: "p4", scoreA: 2, scoreB: 1 },
    ];
    const rows = swissStandings(done, []);
    expect(rows.map((r) => r.participantId)).toEqual(["p1", "p3", "p4", "p2"]);
    expect(rows[0]).toMatchObject({ participantId: "p1", wins: 1, played: 1 });
  });

  it("counts a bye as a win and includes bye-only players", () => {
    const rows = swissStandings([], ["p5"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      participantId: "p5",
      wins: 1,
      played: 1,
      scoreFor: 0,
      diff: 0,
    });
  });

  it("merges a bye into a player's existing head-to-head row", () => {
    const done: DoneMatch[] = [
      { participantAId: "p1", participantBId: "p2", scoreA: 1, scoreB: 0 },
    ];
    const rows = swissStandings(done, ["p1"]);
    const p1 = rows.find((r) => r.participantId === "p1")!;
    expect(p1).toMatchObject({ wins: 2, played: 2 });
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `cd web && npx vitest run src/lib/swiss/standings.test.ts`
Expected: FAIL ("Cannot find module './standings'").

- [ ] **Step 3: Implement.**

```ts
import {
  computeStandings,
  type DoneMatch,
  type StandingRow,
} from "@/lib/standings";

/**
 * Swiss standings: head-to-head tallies from `computeStandings`, plus byes
 * (each bye is +1 win and +1 played with no score change). Players appearing
 * only via a bye are included. Sorted wins desc, diff desc, scoreFor desc, then
 * participantId asc as a deterministic final tiebreak (so the ranked order fed
 * to pairing is stable across calls).
 */
export function swissStandings(
  done: DoneMatch[],
  byeIds: string[],
): StandingRow[] {
  const base = computeStandings(done);
  const byId = new Map<string, StandingRow>(
    base.map((r) => [r.participantId, { ...r }]),
  );
  const order: string[] = base.map((r) => r.participantId);

  for (const id of byeIds) {
    let row = byId.get(id);
    if (!row) {
      row = {
        participantId: id,
        played: 0,
        wins: 0,
        losses: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        diff: 0,
      };
      byId.set(id, row);
      order.push(id);
    }
    row.wins += 1;
    row.played += 1;
  }

  const rows = order.map((id) => byId.get(id)!);
  rows.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.diff !== x.diff) return y.diff - x.diff;
    if (y.scoreFor !== x.scoreFor) return y.scoreFor - x.scoreFor;
    return x.participantId < y.participantId
      ? -1
      : x.participantId > y.participantId
        ? 1
        : 0;
  });
  return rows;
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `cd web && npx vitest run src/lib/swiss/standings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/swiss/standings.ts web/src/lib/swiss/standings.test.ts
git commit -m "feat: swiss standings (byes as wins) with tests"
```

## Task 4: `generateSwissRoundOne` + wire into `generateBracket`

**Files:**
- Create: `web/src/lib/swiss/generate.ts`
- Test: `web/src/lib/swiss/generate.test.ts`
- Modify: `web/src/app/organizer/tournaments/[id]/bracket/actions.ts` (`generatorFor`)

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import type { SeededParticipant } from "@/lib/bracket/types";
import { generateSwissRoundOne } from "./generate";

const seed = (n: number): SeededParticipant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));

describe("generateSwissRoundOne", () => {
  it("emits N/2 pending round-1 matches for even N", () => {
    const m = generateSwissRoundOne(seed(4));
    expect(m).toHaveLength(2);
    expect(m.every((x) => x.round === 1 && x.status === "pending")).toBe(true);
    expect(m.map((x) => x.slot)).toEqual([0, 1]);
    expect(m[0]).toMatchObject({ participantAId: "p1", participantBId: "p2" });
  });

  it("adds a bye row (winner set, status 'bye') for odd N", () => {
    const m = generateSwissRoundOne(seed(5));
    expect(m).toHaveLength(3);
    const bye = m.find((x) => x.status === "bye")!;
    expect(bye).toMatchObject({
      participantAId: "p5",
      participantBId: null,
      winnerId: "p5",
    });
  });

  it("returns [] below 2 participants", () => {
    expect(generateSwissRoundOne(seed(1))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `cd web && npx vitest run src/lib/swiss/generate.test.ts`
Expected: FAIL ("Cannot find module './generate'").

- [ ] **Step 3: Implement `generateSwissRoundOne`.**

```ts
import type { GeneratedMatch, SeededParticipant } from "@/lib/bracket/types";
import { pairSwissRound } from "@/lib/swiss/pairing";

/**
 * Round 1 of a Swiss tournament: pair players in seed order (no history yet, so
 * `pairSwissRound` produces adjacent pairings 1v2, 3v4, …). An odd entrant count
 * yields a bye row that is already decided (`status:'bye'`, `winnerId` = the
 * bye player) so the existing insert pipeline persists it as a free win.
 */
export function generateSwissRoundOne(
  participants: SeededParticipant[],
): GeneratedMatch[] {
  const ids = [...participants]
    .sort((a, b) => a.seed - b.seed)
    .map((p) => p.id);
  if (ids.length < 2) return [];

  const { pairings, bye } = pairSwissRound(ids, new Set(), new Set());

  const matches: GeneratedMatch[] = [];
  let slot = 0;
  for (const [a, b] of pairings) {
    matches.push({
      bracket: "winner",
      round: 1,
      slot,
      participantAId: a,
      participantBId: b,
      winnerId: null,
      status: "pending",
      nextRef: null,
      loserRef: null,
    });
    slot++;
  }
  if (bye) {
    matches.push({
      bracket: "winner",
      round: 1,
      slot,
      participantAId: bye,
      participantBId: null,
      winnerId: bye,
      status: "bye",
      nextRef: null,
      loserRef: null,
    });
  }
  return matches;
}
```

- [ ] **Step 4: Wire into `generateBracket`.** In `web/src/app/organizer/tournaments/[id]/bracket/actions.ts`, add the import and a `swiss` case to `generatorFor`. No other change is needed: the link-resolution block is gated on `single_elim`/`double_elim`, so Swiss simply inserts its round-1 rows (the bye row already carries `winner_id` + `status='bye'`) and flips the tournament to `running`.

```ts
// add to the imports at the top:
import { generateSwissRoundOne } from "@/lib/swiss/generate";

// add inside generatorFor's switch, before `default`:
    case "swiss":
      return generateSwissRoundOne;
```

- [ ] **Step 5: Run unit tests + build.**

Run: `cd web && npx vitest run src/lib/swiss/ && npm run build`
Expected: PASS (3 swiss test files green, build clean).

- [ ] **Step 6: Commit.**

```bash
git add web/src/lib/swiss/generate.ts web/src/lib/swiss/generate.test.ts "web/src/app/organizer/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: generate swiss round 1 + wire into generateBracket"
```

## Task 5: `advanceSwissRound` server action

**Files:**
- Modify: `web/src/app/organizer/tournaments/[id]/bracket/actions.ts` (append the action)

The action computes the next round from the live standings. It guards: staff only, format must be `swiss`, the current round must be fully decided, and the tournament must not already have played all `R` rounds.

- [ ] **Step 1: Add the imports** (top of the file, next to the existing bracket imports):

```ts
import { pairKey, pairSwissRound, swissRoundCount } from "@/lib/swiss/pairing";
import { swissStandings } from "@/lib/swiss/standings";
import type { DoneMatch } from "@/lib/standings";
```

- [ ] **Step 2: Append the action** at the end of `actions.ts`:

```ts
/**
 * Advance a Swiss tournament to its next round.
 *
 * Reads every match so far, verifies the current round is fully decided
 * (`done`/`bye`) and that fewer than `R = ceil(log2(N))` rounds have been
 * played, computes the live standings (byes count as wins), pairs the next
 * round via `pairSwissRound` (avoiding rematches and repeat byes), and inserts
 * the new round's matches. A bye row is inserted already decided.
 */
export async function advanceSwissRound(
  tournamentId: string,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, format")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr) {
    return { error: friendlyDbError(tErr, "Turnier konnte nicht geladen werden.") };
  }
  if (!tournament) return { error: "Turnier nicht gefunden." };
  if (tournament.format !== "swiss") {
    return { error: "Nur für Swiss-Turniere verfügbar." };
  }

  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select(
      "round, status, participant_a_id, participant_b_id, winner_id, score_a, score_b",
    )
    .eq("tournament_id", tournamentId)
    .order("round", { ascending: true });
  if (mErr) {
    return { error: friendlyDbError(mErr, "Matches konnten nicht geladen werden.") };
  }
  if (!matches || matches.length === 0) {
    return { error: "Erst Runde 1 generieren." };
  }

  const currentRound = Math.max(...matches.map((m) => m.round));

  // Entrants = the distinct participants of round 1 (everyone plays each round).
  const entrants = new Set<string>();
  for (const m of matches) {
    if (m.round !== 1) continue;
    if (m.participant_a_id) entrants.add(m.participant_a_id);
    if (m.participant_b_id) entrants.add(m.participant_b_id);
  }
  const totalRounds = swissRoundCount(entrants.size);
  if (currentRound >= totalRounds) {
    return { error: "Alle Swiss-Runden sind gespielt — der Endstand steht fest." };
  }

  const currentDone = matches
    .filter((m) => m.round === currentRound)
    .every((m) => m.status === "done" || m.status === "bye");
  if (!currentDone) {
    return { error: "Die aktuelle Runde ist noch nicht abgeschlossen." };
  }

  // Build standings inputs + play/bye history across ALL rounds.
  const done: DoneMatch[] = [];
  const byeIds: string[] = [];
  const played = new Set<string>();
  const byeHistory = new Set<string>();
  for (const m of matches) {
    if (m.status === "bye") {
      const w = m.winner_id ?? m.participant_a_id;
      if (w) {
        byeIds.push(w);
        byeHistory.add(w);
      }
      continue;
    }
    if (
      m.status === "done" &&
      m.participant_a_id &&
      m.participant_b_id &&
      m.score_a != null &&
      m.score_b != null
    ) {
      done.push({
        participantAId: m.participant_a_id,
        participantBId: m.participant_b_id,
        scoreA: m.score_a,
        scoreB: m.score_b,
      });
      played.add(pairKey(m.participant_a_id, m.participant_b_id));
    }
  }

  const ranked = swissStandings(done, byeIds).map((r) => r.participantId);
  // Safety net: ensure every entrant is ranked (no-op in normal play).
  for (const id of entrants) {
    if (!ranked.includes(id)) ranked.push(id);
  }

  const { pairings, bye } = pairSwissRound(ranked, played, byeHistory);

  const nextRound = currentRound + 1;
  const rows: MatchInsert[] = [];
  let slot = 0;
  for (const [a, b] of pairings) {
    rows.push({
      tournament_id: tournamentId,
      bracket: "winner",
      round: nextRound,
      slot,
      participant_a_id: a,
      participant_b_id: b,
      status: "pending",
    });
    slot++;
  }
  if (bye) {
    rows.push({
      tournament_id: tournamentId,
      bracket: "winner",
      round: nextRound,
      slot,
      participant_a_id: bye,
      participant_b_id: null,
      winner_id: bye,
      status: "bye",
    });
  }

  const { error: insErr } = await supabase.from("matches").insert(rows);
  if (insErr) {
    return { error: friendlyDbError(insErr, "Nächste Runde konnte nicht angelegt werden.") };
  }

  return { ok: true };
}
```

- [ ] **Step 2: Build.**

Run: `cd web && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add "web/src/app/organizer/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: advanceSwissRound action (pairings from live standings)"
```

## Task 6: Swiss view + advance button + page/board wiring

**Files:**
- Create: `web/src/components/brand/swiss-view.tsx`
- Create: `web/src/app/organizer/tournaments/[id]/bracket/advance-round-button.tsx`
- Modify: `web/src/app/organizer/tournaments/[id]/bracket/page.tsx`
- Modify: `web/src/app/t/[tournamentId]/board/board-content.tsx`
- Modify: `web/src/app/t/[tournamentId]/board/page.tsx`

- [ ] **Step 1: Create `SwissView`** — a standings table (reusing `StandingsTable`) beside a per-round schedule that shows scores for decided matches, "vs" for pending, and "· Freilos" for byes; the winner's name is lime.

```tsx
import { StandingsTable } from "@/components/brand/standings-table";
import type { BracketMatch } from "@/components/brand/bracket-view";
import type { StandingRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

/** A Swiss match enriched with scores (round-by-round schedule). */
export type SwissMatch = BracketMatch & {
  scoreA: number | null;
  scoreB: number | null;
};

export type SwissViewProps = {
  matches: SwissMatch[];
  standings: StandingRow[];
  names: Record<string, string>;
  className?: string;
};

/**
 * Swiss view: live standings table + the schedule grouped by round. Decided
 * matches show their score with the winner highlighted; byes are labelled.
 * Presentational — receives matches already joined with display names + scores.
 */
export function SwissView({
  matches,
  standings,
  names,
  className,
}: SwissViewProps) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div
      className={cn("grid gap-8 lg:grid-cols-[1fr_1.1fr]", className)}
      data-testid="swiss-view"
    >
      <section className="flex flex-col gap-3">
        <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-muted">
          Tabelle
        </div>
        <StandingsTable rows={standings} names={names} />
      </section>

      <section className="flex flex-col gap-5">
        <div className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-muted">
          Runden
        </div>
        {rounds.map((r) => {
          const round = matches
            .filter((m) => m.round === r)
            .sort((a, b) => a.slot - b.slot);
          return (
            <div key={r} className="flex flex-col gap-2.5">
              <div className="font-display text-[11px] uppercase tracking-[0.14em] text-fg-dim">
                Runde {r}
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {round.map((m, i) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      i > 0 && "border-t border-line/60",
                    )}
                  >
                    {m.status === "bye" ? (
                      <span className="flex-1 truncate font-display text-sm font-semibold text-ink">
                        {m.aName ?? "TBD"}{" "}
                        <span className="text-fg-dim">· Freilos</span>
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "flex-1 truncate text-right font-display text-sm font-semibold",
                            m.winnerId && m.winnerId === m.participantAId
                              ? "text-lime"
                              : "text-ink",
                          )}
                        >
                          {m.aName ?? "TBD"}
                        </span>
                        <span className="font-display text-[11px] tabular-nums text-fg-dim">
                          {m.status === "done"
                            ? `${m.scoreA ?? "–"}:${m.scoreB ?? "–"}`
                            : "vs"}
                        </span>
                        <span
                          className={cn(
                            "flex-1 truncate font-display text-sm font-semibold",
                            m.winnerId && m.winnerId === m.participantBId
                              ? "text-lime"
                              : "text-ink",
                          )}
                        >
                          {m.bName ?? "TBD"}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create `AdvanceRoundButton`** — a client component mirroring the existing `generate-button.tsx` (read it first for the exact `useState`/pending/error idiom and button styling). It calls `advanceSwissRound` and refreshes on success.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { advanceSwissRound } from "./actions";

export function AdvanceRoundButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await advanceSwissRound(tournamentId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-6 py-3 font-display text-sm font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Wird ausgelost…" : "Nächste Runde auslosen →"}
      </button>
      {error && <p className="text-sm text-live">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire the organizer bracket page** (`bracket/page.tsx`). Three edits:

  (a) Add `score_a, score_b` to the matches `select` (line ~88) and `swissStandings` + `swissRoundCount`/`pairing` imports + `SwissView`/`AdvanceRoundButton` imports.

  (b) Build a `SwissMatch[]` (the existing `DoubleElimMatch[]` map plus `scoreA`/`scoreB`) and, when `tournament.format === "swiss"`, compute `standings` via `swissStandings` and the `names` map, plus `currentRound` / `totalRounds` / `currentRoundComplete`.

  (c) In the "Spielplan" section, add a `swiss` branch before `round_robin` that renders `<SwissView …>` and, when `currentRoundComplete && currentRound < totalRounds`, an `<AdvanceRoundButton tournamentId={id} />`.

Concrete additions:

```tsx
// imports
import { SwissView, type SwissMatch } from "@/components/brand/swiss-view";
import { AdvanceRoundButton } from "./advance-round-button";
import { swissStandings } from "@/lib/swiss/standings";
import { swissRoundCount, pairKey } from "@/lib/swiss/pairing";
import type { DoneMatch } from "@/lib/standings";

// extend RawMatch with scores:
//   score_a: number | null;
//   score_b: number | null;
// and add "score_a, score_b" to the .select(...) string.

// after building `matches` (DoubleElimMatch[]), also build swiss data:
const swissMatches: SwissMatch[] = (rawMatches ?? []).map((m) => ({
  id: m.id,
  bracket: m.bracket,
  round: m.round,
  slot: m.slot,
  status: m.status,
  winnerId: m.winner_id,
  participantAId: m.participant_a_id,
  participantBId: m.participant_b_id,
  aName: m.a?.display_name ?? null,
  bName: m.b?.display_name ?? null,
  scoreA: m.score_a,
  scoreB: m.score_b,
}));

const names: Record<string, string> = {};
for (const m of swissMatches) {
  if (m.participantAId && m.aName) names[m.participantAId] = m.aName;
  if (m.participantBId && m.bName) names[m.participantBId] = m.bName;
}

const doneForStandings: DoneMatch[] = swissMatches
  .filter(
    (m) =>
      m.status === "done" &&
      m.participantAId &&
      m.participantBId &&
      m.scoreA != null &&
      m.scoreB != null,
  )
  .map((m) => ({
    participantAId: m.participantAId!,
    participantBId: m.participantBId!,
    scoreA: m.scoreA!,
    scoreB: m.scoreB!,
  }));
const byeIdsForStandings = swissMatches
  .filter((m) => m.status === "bye")
  .map((m) => m.winnerId ?? m.participantAId)
  .filter((x): x is string => !!x);
const swissStandingRows = swissStandings(doneForStandings, byeIdsForStandings);

const entrantCount = new Set(
  swissMatches
    .filter((m) => m.round === 1)
    .flatMap((m) => [m.participantAId, m.participantBId])
    .filter((x): x is string => !!x),
).size;
const currentRound = swissMatches.length
  ? Math.max(...swissMatches.map((m) => m.round))
  : 0;
const totalRounds = swissRoundCount(entrantCount);
const currentRoundComplete =
  currentRound > 0 &&
  swissMatches
    .filter((m) => m.round === currentRound)
    .every((m) => m.status === "done" || m.status === "bye");
```

```tsx
// in the "Spielplan" conditional, FIRST branch:
{tournament.format === "swiss" ? (
  <div className="flex flex-col gap-6">
    <SwissView
      matches={swissMatches}
      standings={swissStandingRows}
      names={names}
    />
    {currentRoundComplete && currentRound < totalRounds && (
      <AdvanceRoundButton tournamentId={id} />
    )}
    {currentRound >= totalRounds && totalRounds > 0 && (
      <p className="font-display text-sm uppercase tracking-[0.12em] text-lime">
        Alle {totalRounds} Runden gespielt — Endstand steht.
      </p>
    )}
  </div>
) : tournament.format === "round_robin" ? (
  <RoundRobinView matches={matches} />
) : tournament.format === "double_elim" ? (
  <DoubleElimView matches={matches} />
) : (
  <BracketView matches={matches} />
)}
```

> Note: `pairKey` import is not strictly needed on the page; drop it if `npm run build` flags it as unused. Keep `swissRoundCount`, `swissStandings`, `DoneMatch`.

- [ ] **Step 4: Wire the public board.** In `board/page.tsx`, when the tournament `format === "swiss"`, compute the standings with `swissStandings` (byes included) instead of `computeStandings`, then pass them to `BoardContent` (which already accepts a `standings` prop). In `board-content.tsx`, add an `isSwiss` branch that renders `<SwissView matches={matches} standings={standings} names={names} />`. (The board's `BoardMatch` is `BracketMatch & { bracket; scoreA; scoreB }`, structurally a `SwissMatch`, so it passes directly.)

```tsx
// board-content.tsx — add import:
import { SwissView } from "@/components/brand/swiss-view";
// add near isRoundRobin/isDoubleElim:
const isSwiss = format === "swiss";
// in the final conditional, add as the FIRST branch:
{isSwiss ? (
  <section>
    <div className={cn(SECTION_LABEL, "mb-4")}>Swiss</div>
    <SwissView matches={matches} standings={standings} names={names} />
  </section>
) : isRoundRobin ? (
  /* …existing… */
) : isDoubleElim ? (
  /* …existing… */
) : (
  /* …existing… */
)}
```

For `board/page.tsx`, read it first to match its standings-building idiom; the change is: branch on format and call `swissStandings(done, byeIds)` for swiss (collect `byeIds` from `status==='bye'` rows' `winner_id ?? participant_a_id`).

- [ ] **Step 5: Build.**

Run: `cd web && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add web/src/components/brand/swiss-view.tsx "web/src/app/organizer/tournaments/[id]/bracket/advance-round-button.tsx" "web/src/app/organizer/tournaments/[id]/bracket/page.tsx" "web/src/app/t/[tournamentId]/board/board-content.tsx" "web/src/app/t/[tournamentId]/board/page.tsx"
git commit -m "feat(design): swiss view (standings + rounds) + advance-round button"
```

## Task 7: e2e + docs

**Files:**
- Create: `web/e2e/swiss.spec.ts`
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Write the e2e.** Mirror the fixture setup in `web/e2e/double-elim.spec.ts` (read it first): a `beforeAll` that creates a `format='swiss'`, `status='registration'` tournament via the organizer service client and registers + checks in **4** solo adults; an `afterAll` that deletes the fixture tournament (so the shared "Sommer Cup" is untouched). Keep assertions order-independent.

```ts
// web/e2e/swiss.spec.ts — structure (fill fixture helpers by mirroring double-elim.spec.ts)
import { expect, test } from "@playwright/test";
// ...same imports/fixture helpers as double-elim.spec.ts...

test.describe("Swiss system", () => {
  // beforeAll: create swiss tournament + 4 checked-in adults (mirror double-elim.spec.ts)
  // afterAll: delete the fixture tournament

  test("generates round 1, advances to round 2", async ({ page }) => {
    // organizer logs in, opens the bracket page, seeds + generates
    // → round 1 = 2 matches
    await page.goto(`/organizer/tournaments/${tournamentId}/bracket`);
    await expect(page.getByTestId("swiss-view")).toBeVisible();
    await expect(page.getByText("Runde 1")).toBeVisible();

    // confirm both round-1 matches via the organizer results flow
    // (mirror how double-elim.spec.ts confirms WB R1)
    // ...

    // advance: button appears once the round is complete
    await page.getByRole("button", { name: /Nächste Runde/ }).click();
    await expect(page.getByText("Runde 2")).toBeVisible();

    // N=4 → R=2, so after round 2 the advance button is gone / "Endstand" shows
  });
});
```

- [ ] **Step 2: Run the e2e.**

Run: `cd web && npx playwright test e2e/swiss.spec.ts`
Expected: PASS (round 1 renders, confirming both matches enables "Nächste Runde", round 2 appears with 2 matches).

- [ ] **Step 3: Update `docs/DEPLOY.md`.** Append a "Plan 8 — Swiss System" note stating: **no migration** (the `tournament_format` enum already has `swiss` and `matches` already supports byes); Swiss is generated round-by-round; `R = ceil(log2(N))` rounds; odd entrant counts get a bye (free win); results use the existing report/confirm flow; the organizer advances rounds from the bracket page.

- [ ] **Step 4: Full verification.**

Run: `cd web && npm run build && npm test && npx playwright test`
Expected: build clean; all unit tests green (incl. the 3 new swiss files); e2e green.

- [ ] **Step 5: Commit.**

```bash
git add web/e2e/swiss.spec.ts docs/DEPLOY.md
git commit -m "feat: swiss e2e + docs"
```

---

## Self-Review

- **Spec coverage:** Swiss format (round-by-round), `R = ceil(log2(N))` rounds (Task 2), score-based pairing with rematch avoidance (Task 2), byes for odd N as free wins (Tasks 2/3/4), standings (Task 3), generate round 1 (Task 4), advance subsequent rounds (Task 5), organizer + public views (Task 6), e2e (Task 7).
- **No migration:** justified and documented — enum value + bye support already exist. Confirmed against `20260616120000_base_schema.sql` and `20260619090000_matches.sql`.
- **Security:** `advanceSwissRound` is `requireStaff`-guarded and format-checked; pairing/standings are pure; matches stay public-read / staff-write per existing RLS; results stay on the audited `report_match`/`confirm_match` path.
- **Correctness:** the pairing + standings cores are exhaustively unit-tested (even/odd, rematch avoidance, repeat-bye avoidance, rematch fallback); the action mirrors the tested pure functions; deterministic tiebreak keeps the ranked order stable.
- **Type consistency:** `pairSwissRound`/`pairKey`/`swissRoundCount` (pairing.ts), `swissStandings` (standings.ts), `generateSwissRoundOne` (generate.ts), `advanceSwissRound` (actions.ts), `SwissMatch`/`SwissView` (swiss-view.tsx), `AdvanceRoundButton` — names are used consistently across tasks.

## Done = all true
- `swiss` is a recognized format (type + label); generating a Swiss bracket lays down round 1 (with a bye for odd N); the organizer can advance round-by-round until `R` rounds are played; standings (byes as wins) + per-round schedule render on the organizer page and the public board; pairings avoid rematches and repeat byes; **no migration required**; build + unit tests + e2e green.
