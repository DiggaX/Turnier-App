# Groups → Playoffs Implementation Plan (Plan 9 — Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The generator supports **Gruppen → Playoffs** (`groups_playoffs`): split the `N` checked-in players into `G` groups, play a **round-robin inside each group**, then take the **top 2 of each group** into a **seeded single-elimination playoff**. Phase 1 (groups) is laid down by `generateBracket`; once every group match is decided, the organizer triggers `generatePlayoffs`, which seeds the bracket from the live group standings. Organizer page + public board show per-group standings & schedules, then the playoff bracket.

**Architecture:** Reuses `generateRoundRobin` (per group), `computeStandings` (per group), `generateSingleElim` (the playoff), the `report_match`/`confirm_match` RPCs (unchanged), and the existing link-resolution helpers. The ONE new column is `matches.group_no` (which group a match belongs to; `NULL` = playoff). Group membership and per-group standings are derived from the `group_no`-tagged matches — no participant-side column needed. A new pure `generateGroupStage` (TDD) emits the tagged group round-robins; a new `generatePlayoffs` server action (mirroring the Swiss `advanceSwissRound` shape) builds the bracket from group standings.

**MVP scope (documented, not hidden):** group count is **derived** `G = ceil(N/4)` (target ~4 per group), **top 2** of each group advance, playoff is **single-elimination** (byes via `generateSingleElim` if `2G` isn't a power of two). Requires **N ≥ 6** (so ≥ 2 groups of ≥ 3). Deferred: organizer-configurable group/advance counts, double-elim playoff, cross-group 3rd-place tiebreakers, auto-flip to `finished`.

**Tech Stack:** Next.js 16 (App Router, `web/`) · Supabase (Postgres, RPC) · pure TS (Vitest) · Playwright. Read `node_modules/next/dist/docs/` before writing Next code (this is Next 16).

---

## Prerequisites — manual dashboard steps
Apply the Task 1 migration (`matches.group_no`) in the SQL editor before the playoff flow is used. (Generation of the group stage will also fail without it, since inserts set `group_no`.)

---

## Task 1: Schema — `matches.group_no`

**Files:** Create `supabase/migrations/20260624090000_groups_playoffs.sql`.

- [ ] **Step 1: Write the migration.**

```sql
-- Plan 9: Groups -> Playoffs. Tag each group-stage match with its group number;
-- playoff matches leave it NULL. Idempotent (ignore an already-existing column).
alter table matches add column if not exists group_no int;
```

- [ ] **Step 2: Apply it** in the Supabase SQL editor (the user does this). Verify anon `select group_no from matches limit 1` works (→ returns rows or `[]`, no error).

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/20260624090000_groups_playoffs.sql
git commit -m "feat: matches.group_no column for groups->playoffs"
```

## Task 2: Types — `groupNo` on `GeneratedMatch` + DB types

**Files:**
- Modify: `web/src/lib/bracket/types.ts`
- Modify: `web/src/lib/database.types.ts` (the `matches` Row/Insert/Update)

- [ ] **Step 1: Add an OPTIONAL `groupNo` to `GeneratedMatch`.** Optional so the existing single-elim / double-elim / round-robin / swiss generators (which don't set it) keep compiling untouched.

In `web/src/lib/bracket/types.ts`, add to the `GeneratedMatch` interface:

```ts
  // Group-stage tag (groups->playoffs). null/undefined for every other format
  // and for the playoff bracket itself.
  groupNo?: number | null;
```

- [ ] **Step 2: Add `group_no` to the DB `matches` type.** In `web/src/lib/database.types.ts`, find the `matches` table block and add `group_no: number | null` to `Row`, `group_no?: number | null` to `Insert`, and `group_no?: number | null` to `Update` (match the existing formatting of neighbours like `next_match_id`).

- [ ] **Step 3: Build.**

Run: `cd web && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add web/src/lib/bracket/types.ts web/src/lib/database.types.ts
git commit -m "feat: types for matches.group_no + GeneratedMatch.groupNo"
```

## Task 3: Pure group helpers — assign + generate + count (TDD)

**Files:**
- Create: `web/src/lib/groups/groups.ts`
- Test: `web/src/lib/groups/groups.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import type { SeededParticipant } from "@/lib/bracket/types";
import { assignGroups, generateGroupStage, groupCountFor } from "./groups";

const seed = (n: number): SeededParticipant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seed: i + 1 }));

describe("groupCountFor", () => {
  it("is ceil(N/4), min 2 once N>=6, else 0 below 6", () => {
    expect(groupCountFor(5)).toBe(0);
    expect(groupCountFor(6)).toBe(2);
    expect(groupCountFor(8)).toBe(2);
    expect(groupCountFor(9)).toBe(3);
    expect(groupCountFor(16)).toBe(4);
  });
});

describe("assignGroups", () => {
  it("snake-distributes by seed into G balanced groups", () => {
    const groups = assignGroups(seed(8), 2);
    expect(groups).toHaveLength(2);
    // snake: seeds 1,4,5,8 -> group 0 ; 2,3,6,7 -> group 1
    expect(groups[0].map((p) => p.seed)).toEqual([1, 4, 5, 8]);
    expect(groups[1].map((p) => p.seed)).toEqual([2, 3, 6, 7]);
  });

  it("handles uneven counts (sizes differ by at most 1)", () => {
    const groups = assignGroups(seed(6), 2); // snake: 1,4,5 | 2,3,6
    expect(groups[0].map((p) => p.seed)).toEqual([1, 4, 5]);
    expect(groups[1].map((p) => p.seed)).toEqual([2, 3, 6]);
  });
});

describe("generateGroupStage", () => {
  it("emits a round-robin per group, each match tagged with its group_no", () => {
    const matches = generateGroupStage(seed(8), 2);
    // 2 groups of 4 -> each group round-robin = C(4,2)=6 matches -> 12 total
    expect(matches).toHaveLength(12);
    expect(matches.every((m) => m.bracket === "winner")).toBe(true);
    const g0 = matches.filter((m) => m.groupNo === 0);
    const g1 = matches.filter((m) => m.groupNo === 1);
    expect(g0).toHaveLength(6);
    expect(g1).toHaveLength(6);
    // every group-0 match is between group-0 members
    const g0ids = new Set(["p1", "p4", "p5", "p8"]);
    expect(
      g0.every(
        (m) => g0ids.has(m.participantAId!) && g0ids.has(m.participantBId!),
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `cd web && npx vitest run src/lib/groups/groups.test.ts`
Expected: FAIL ("Cannot find module './groups'").

- [ ] **Step 3: Implement.**

```ts
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
```

- [ ] **Step 4: Run to verify it passes.**

Run: `cd web && npx vitest run src/lib/groups/groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/groups/groups.ts web/src/lib/groups/groups.test.ts
git commit -m "feat: pure group assignment + group-stage generator with tests"
```

## Task 4: Playoff seeding (TDD)

**Files:**
- Create: `web/src/lib/groups/playoff-seeding.ts`
- Test: `web/src/lib/groups/playoff-seeding.test.ts`

Given each group's ranked standings, build the seeded advancer list for the playoff: group winners first (in group order), then runners-up in REVERSE group order, so a group winner can only meet that same group's runner-up in the final rounds.

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { seedPlayoffAdvancers } from "./playoff-seeding";

describe("seedPlayoffAdvancers", () => {
  it("takes top 2 per group; winners then runners-up reversed", () => {
    // 2 groups, each already ranked best-first
    const ranked = [
      ["A1", "A2", "A3"],
      ["B1", "B2", "B3"],
    ];
    const seeded = seedPlayoffAdvancers(ranked, 2);
    // winners [A1,B1] then runners-up reversed [B2,A2]
    expect(seeded.map((p) => p.id)).toEqual(["A1", "B1", "B2", "A2"]);
    expect(seeded.map((p) => p.seed)).toEqual([1, 2, 3, 4]);
  });

  it("supports more than two groups", () => {
    const ranked = [
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"],
    ];
    const seeded = seedPlayoffAdvancers(ranked, 2);
    expect(seeded.map((p) => p.id)).toEqual(["A1", "B1", "C1", "C2", "B2", "A2"]);
  });

  it("skips groups too small to supply an advancer at a given rank", () => {
    const ranked = [["A1"], ["B1", "B2"]];
    const seeded = seedPlayoffAdvancers(ranked, 2);
    // winners [A1,B1], runners-up reversed [B2] (A has no 2nd)
    expect(seeded.map((p) => p.id)).toEqual(["A1", "B1", "B2"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `cd web && npx vitest run src/lib/groups/playoff-seeding.test.ts`
Expected: FAIL ("Cannot find module './playoff-seeding'").

- [ ] **Step 3: Implement.**

```ts
import type { SeededParticipant } from "@/lib/bracket/types";

/**
 * Build the seeded advancer list for the playoff from per-group ranked
 * standings (each inner array is one group's participant ids, best first).
 *
 * Order: all rank-1 finishers in group order, then rank-2 in REVERSE group
 * order, then rank-3 in group order, … up to `advancePerGroup` ranks. Reversing
 * alternate ranks keeps a group's winner and runner-up on opposite ends of the
 * bracket. Each advancer gets `seed = index + 1`. Groups that lack a finisher at
 * a given rank are simply skipped for that rank.
 */
export function seedPlayoffAdvancers(
  rankedByGroup: string[][],
  advancePerGroup: number,
): SeededParticipant[] {
  const ids: string[] = [];
  for (let rank = 0; rank < advancePerGroup; rank++) {
    const order =
      rank % 2 === 0
        ? rankedByGroup
        : [...rankedByGroup].reverse();
    for (const group of order) {
      if (group[rank] !== undefined) ids.push(group[rank]);
    }
  }
  return ids.map((id, i) => ({ id, seed: i + 1 }));
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `cd web && npx vitest run src/lib/groups/playoff-seeding.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/groups/playoff-seeding.ts web/src/lib/groups/playoff-seeding.test.ts
git commit -m "feat: playoff seeding from group standings with tests"
```

## Task 5: `generateBracket` — group stage branch

**Files:** Modify `web/src/app/organizer/tournaments/[id]/bracket/actions.ts`.

The `groups_playoffs` format generates the GROUP STAGE only (the playoff comes later via Task 6). It does not use `generatorFor` (which needs the derived group count), and it persists `group_no`.

- [ ] **Step 1: Add imports** at the top:

```ts
import { generateGroupStage, groupCountFor } from "@/lib/groups/groups";
```

- [ ] **Step 2: Persist `group_no` in the insert.** In `generateBracket`, the `rows` mapping currently omits `group_no`. Add it so group-stage matches are tagged:

```ts
  const rows: MatchInsert[] = generated.map((m) => ({
    tournament_id: tournamentId,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    participant_a_id: m.participantAId,
    participant_b_id: m.participantBId,
    winner_id: m.winnerId,
    status: m.status,
    group_no: m.groupNo ?? null,
  }));
```

- [ ] **Step 3: Branch the generator selection.** Replace the current `const generator = generatorFor(...)` / `if (!generator)` / `generated = generator(seeded)` flow so `groups_playoffs` uses `generateGroupStage`. Concretely, after the `seeded` array is built and seeds are persisted, replace the generation block with:

```ts
  let generated: GeneratedMatch[];
  if (tournament.format === "groups_playoffs") {
    const g = groupCountFor(seeded.length);
    if (g === 0) {
      return {
        error:
          "Gruppen → Playoffs braucht mindestens 6 eingecheckte Teilnehmer.",
      };
    }
    generated = generateGroupStage(seeded, g);
  } else {
    const generator = generatorFor(tournament.format);
    if (!generator) {
      return { error: "Format wird noch nicht unterstützt." };
    }
    try {
      generated = generator(seeded);
    } catch {
      if (tournament.format === "double_elim") {
        return {
          error:
            "Double Elimination braucht 4, 8, 16 … (Zweierpotenz) eingecheckte Teilnehmer.",
        };
      }
      return { error: "Es konnten keine Matches erzeugt werden." };
    }
  }
  if (generated.length === 0) {
    return { error: "Es konnten keine Matches erzeugt werden." };
  }
```

> Keep the existing link-resolution block (gated on `single_elim`/`double_elim`) exactly as-is — `groups_playoffs` skips it (group matches have no advancement links). The status flip to `running` also stays.

- [ ] **Step 4: Build + unit tests.**

Run: `cd web && npm run build && npm test`
Expected: PASS (no regressions; build clean).

- [ ] **Step 5: Commit.**

```bash
git add "web/src/app/organizer/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: generateBracket lays down the group stage (groups->playoffs)"
```

## Task 6: `generatePlayoffs` server action

**Files:** Modify `web/src/app/organizer/tournaments/[id]/bracket/actions.ts` (append the action).

Once every group match is decided, seed and insert the single-elim playoff from the live group standings.

- [ ] **Step 1: Add imports:**

```ts
import { generateSingleElim } from "@/lib/bracket/single-elim";
import { computeStandings, type DoneMatch } from "@/lib/standings";
import { seedPlayoffAdvancers } from "@/lib/groups/playoff-seeding";
```

(`generateSingleElim` and `computeStandings` may already be imported — if so, don't duplicate. `buildIdMap`, `resolveLinkUpdates`, `resolveByeAdvances` are already imported at the top of the file.)

- [ ] **Step 2: Append the action.**

```ts
const ADVANCE_PER_GROUP = 2;

/**
 * Generate the single-elimination playoff for a groups->playoffs tournament.
 *
 * Guards: staff only, format must be `groups_playoffs`, a group stage must
 * exist, every group match must be decided, and the playoff must not already
 * exist. Computes each group's standings (top `ADVANCE_PER_GROUP` advance),
 * seeds them so group winners sit opposite their runners-up, generates a seeded
 * single-elim bracket (group_no = NULL), inserts it, and wires advancement +
 * bye links exactly like generateBracket does for single-elim.
 */
export async function generatePlayoffs(
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
  if (tournament.format !== "groups_playoffs") {
    return { error: "Nur für Gruppen → Playoffs verfügbar." };
  }

  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select(
      "group_no, status, participant_a_id, participant_b_id, score_a, score_b",
    )
    .eq("tournament_id", tournamentId);
  if (mErr) {
    return { error: friendlyDbError(mErr, "Matches konnten nicht geladen werden.") };
  }
  const all = matches ?? [];
  const groupMatches = all.filter((m) => m.group_no !== null);
  const playoffMatches = all.filter((m) => m.group_no === null);

  if (groupMatches.length === 0) {
    return { error: "Erst die Gruppenphase generieren." };
  }
  if (playoffMatches.length > 0) {
    return { error: "Die Playoffs wurden bereits ausgelost." };
  }
  const allDone = groupMatches.every(
    (m) => m.status === "done" || m.status === "bye",
  );
  if (!allDone) {
    return { error: "Die Gruppenphase ist noch nicht abgeschlossen." };
  }

  // Per-group standings from that group's decided matches.
  const groupNos = [...new Set(groupMatches.map((m) => m.group_no as number))].sort(
    (a, b) => a - b,
  );
  const rankedByGroup: string[][] = groupNos.map((gNo) => {
    const done: DoneMatch[] = groupMatches
      .filter(
        (m) =>
          m.group_no === gNo &&
          m.status === "done" &&
          m.participant_a_id &&
          m.participant_b_id &&
          m.score_a != null &&
          m.score_b != null,
      )
      .map((m) => ({
        participantAId: m.participant_a_id as string,
        participantBId: m.participant_b_id as string,
        scoreA: m.score_a as number,
        scoreB: m.score_b as number,
      }));
    return computeStandings(done).map((r) => r.participantId);
  });

  const seeded = seedPlayoffAdvancers(rankedByGroup, ADVANCE_PER_GROUP);
  if (seeded.length < 2) {
    return { error: "Zu wenige Teilnehmer für die Playoffs." };
  }

  const generated = generateSingleElim(seeded);
  if (generated.length === 0) {
    return { error: "Playoff-Bracket konnte nicht erzeugt werden." };
  }

  // Insert the playoff matches (group_no stays NULL).
  const rows: MatchInsert[] = generated.map((m) => ({
    tournament_id: tournamentId,
    bracket: m.bracket,
    round: m.round,
    slot: m.slot,
    participant_a_id: m.participantAId,
    participant_b_id: m.participantBId,
    winner_id: m.winnerId,
    status: m.status,
    group_no: null,
  }));
  const { data: inserted, error: insErr } = await supabase
    .from("matches")
    .insert(rows)
    .select("id, bracket, round, slot");
  if (insErr || !inserted) {
    return { error: friendlyDbError(insErr, "Playoff-Matches konnten nicht angelegt werden.") };
  }

  // Wire winner advancement + auto-advance byes (same as single-elim).
  let idMap;
  try {
    idMap = buildIdMap(generated, inserted);
  } catch {
    return { error: "Playoff-Bracket konnte nicht verknüpft werden." };
  }
  for (const u of resolveLinkUpdates(generated, idMap)) {
    const { error: linkErr } = await supabase
      .from("matches")
      .update({ next_match_id: u.nextMatchId, next_slot: u.nextSlot })
      .eq("id", u.id);
    if (linkErr) {
      return { error: friendlyDbError(linkErr, "Bracket-Verknüpfung fehlgeschlagen.") };
    }
  }
  for (const a of resolveByeAdvances(generated, idMap)) {
    const patch =
      a.nextSlot === "a"
        ? { participant_a_id: a.winnerId }
        : { participant_b_id: a.winnerId };
    const { error: advErr } = await supabase
      .from("matches")
      .update(patch)
      .eq("id", a.nextMatchId);
    if (advErr) {
      return { error: friendlyDbError(advErr, "Freilos konnte nicht weitergeleitet werden.") };
    }
  }

  return { ok: true };
}
```

- [ ] **Step 3: Build.**

Run: `cd web && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add "web/src/app/organizer/tournaments/[id]/bracket/actions.ts"
git commit -m "feat: generatePlayoffs action (seeded single-elim from group standings)"
```

## Task 7: Groups view + playoff button + page/board wiring

**Files:**
- Create: `web/src/components/brand/groups-view.tsx`
- Create: `web/src/app/organizer/tournaments/[id]/bracket/generate-playoffs-button.tsx`
- Modify: `web/src/app/organizer/tournaments/[id]/bracket/page.tsx`
- Modify: `web/src/app/t/[tournamentId]/board/board-content.tsx`
- Modify: `web/src/app/t/[tournamentId]/board/page.tsx`

- [ ] **Step 1: Create `GroupsView`** — one block per group (standings table + schedule). Receives matches enriched with names/scores + each group's standings.

```tsx
import { StandingsTable } from "@/components/brand/standings-table";
import type { BracketMatch } from "@/components/brand/bracket-view";
import type { StandingRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

/** A group-stage match enriched with scores. */
export type GroupMatch = BracketMatch & {
  groupNo: number | null;
  scoreA: number | null;
  scoreB: number | null;
};

export type GroupsViewProps = {
  matches: GroupMatch[];
  /** standings rows per group, indexed by group_no. */
  standingsByGroup: Record<number, StandingRow[]>;
  names: Record<string, string>;
  className?: string;
};

const GROUP_LABEL = (n: number) => `Gruppe ${String.fromCharCode(65 + n)}`;

/**
 * Groups view: one section per group with its standings table and its
 * match schedule (decided matches show the score, winner in lime).
 * Presentational — receives matches joined with names + scores.
 */
export function GroupsView({
  matches,
  standingsByGroup,
  names,
  className,
}: GroupsViewProps) {
  const groupNos = [
    ...new Set(
      matches
        .map((m) => m.groupNo)
        .filter((g): g is number => g !== null),
    ),
  ].sort((a, b) => a - b);

  return (
    <div className={cn("flex flex-col gap-8", className)} data-testid="groups-view">
      {groupNos.map((gNo) => {
        const groupMatches = matches
          .filter((m) => m.groupNo === gNo)
          .sort((a, b) => a.round - b.round || a.slot - b.slot);
        return (
          <section key={gNo} className="flex flex-col gap-3">
            <div className="font-display text-xs uppercase tracking-[0.18em] text-cyan">
              {GROUP_LABEL(gNo)}
            </div>
            <StandingsTable
              rows={standingsByGroup[gNo] ?? []}
              names={names}
            />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {groupMatches.map((m, i) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    i > 0 && "border-t border-line/60",
                  )}
                >
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
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `GeneratePlayoffsButton`** — client component mirroring `advance-round-button.tsx` (read it first), calling `generatePlayoffs`.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generatePlayoffs } from "./actions";

export function GeneratePlayoffsButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const res = await generatePlayoffs(tournamentId);
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
        {pending ? "Wird ausgelost…" : "Playoffs auslosen →"}
      </button>
      {error && <p className="text-sm text-live">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire the organizer bracket page** (`bracket/page.tsx`). Read it first; it already builds a `swissMatches`/`SwissMatch[]` array with scores and a `names` map (Task 6 of the Swiss plan). Reuse that shape:
  - Build a `GroupMatch[]` (same fields as `SwissMatch` plus `groupNo: m.group_no`). Add `group_no` to the `RawMatch` type and the `.select(...)` string if not already present (it has `score_a, score_b` from the Swiss work — add `group_no`).
  - Compute `standingsByGroup`: for each distinct `group_no`, `computeStandings` over that group's decided matches.
  - Compute `groupStageComplete` = there are group matches and all are `done`/`bye`; `playoffExists` = any match with `group_no === null`.
  - In the "Spielplan" conditional, add a `groups_playoffs` branch (before the others) that renders `<GroupsView …>` plus the playoff: if `playoffExists`, also render `<BracketView matches={playoffOnly} />` (the `group_no === null` matches); else if `groupStageComplete`, render `<GeneratePlayoffsButton tournamentId={id} />`.

Concrete additions:

```tsx
import { GroupsView, type GroupMatch } from "@/components/brand/groups-view";
import { GeneratePlayoffsButton } from "./generate-playoffs-button";
import { computeStandings, type DoneMatch } from "@/lib/standings";

// extend RawMatch with `group_no: number | null;` and add "group_no" to .select(...)

const groupMatches: GroupMatch[] = (rawMatches ?? []).map((m) => ({
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
  groupNo: m.group_no,
  scoreA: m.score_a,
  scoreB: m.score_b,
}));

const groupNosPresent = [
  ...new Set(
    groupMatches.map((m) => m.groupNo).filter((g): g is number => g !== null),
  ),
];
const standingsByGroup: Record<number, ReturnType<typeof computeStandings>> = {};
for (const gNo of groupNosPresent) {
  const done: DoneMatch[] = groupMatches
    .filter(
      (m) =>
        m.groupNo === gNo &&
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
  standingsByGroup[gNo] = computeStandings(done);
}
const stageGroupMatches = groupMatches.filter((m) => m.groupNo !== null);
const playoffMatches = matches.filter(
  (m) => groupMatches.find((g) => g.id === m.id)?.groupNo == null,
);
const groupStageComplete =
  stageGroupMatches.length > 0 &&
  stageGroupMatches.every((m) => m.status === "done" || m.status === "bye");
const playoffExists = groupMatches.some((m) => m.groupNo === null);
```

```tsx
// FIRST branch in the Spielplan conditional:
{tournament.format === "groups_playoffs" ? (
  <div className="flex flex-col gap-8">
    <GroupsView
      matches={groupMatches.filter((m) => m.groupNo !== null)}
      standingsByGroup={standingsByGroup}
      names={names}
    />
    {playoffExists ? (
      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
          Playoffs
        </h3>
        <BracketView matches={matches.filter((m) => groupMatches.find((g) => g.id === m.id)?.groupNo == null)} />
      </section>
    ) : groupStageComplete ? (
      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <GeneratePlayoffsButton tournamentId={id} />
      </section>
    ) : null}
  </div>
) : tournament.format === "swiss" ? (
  /* …existing swiss branch… */
) : tournament.format === "round_robin" ? (
  /* … */
) : tournament.format === "double_elim" ? (
  /* … */
) : (
  /* … */
)}
```

> `names` is the id→display-name map already built for the Swiss branch; if it isn't in scope yet on this page, build it the same way (from `groupMatches`' `participantAId/aName` + `participantBId/bName`).

- [ ] **Step 4: Wire the public board.** In `board/page.tsx`, when `format === "groups_playoffs"`, compute `standingsByGroup` (per group, as above) and pass it to `BoardContent`. In `board-content.tsx`, add a `groups_playoffs` branch that renders `<GroupsView …>` for the group matches plus `<BracketView matches={playoffMatches} />` for the `group_no === null` matches. Extend `BoardContentProps` with an optional `standingsByGroup?: Record<number, StandingRow[]>` and `BoardMatch` already has `scoreA`/`scoreB`; add `groupNo` to it (from `group_no`). Read both files first and follow their idiom; keep the existing branches unchanged.

- [ ] **Step 5: Build + unit tests.**

Run: `cd web && npm run build && npm test`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add web/src/components/brand/groups-view.tsx "web/src/app/organizer/tournaments/[id]/bracket/generate-playoffs-button.tsx" "web/src/app/organizer/tournaments/[id]/bracket/page.tsx" "web/src/app/t/[tournamentId]/board/board-content.tsx" "web/src/app/t/[tournamentId]/board/page.tsx"
git commit -m "feat(design): groups view (per-group standings + schedule) + playoff bracket + button"
```

## Task 8: e2e + docs

**Files:**
- Create: `web/e2e/groups-playoffs.spec.ts`
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Write the e2e.** Mirror the fixture setup in `web/e2e/swiss.spec.ts` (read it first): `beforeAll` creates a `format='groups_playoffs'`, `status='registration'` tournament via the organizer service client and registers + checks in **8** solo adults; `afterAll` deletes it. Assertions (order-independent):
  - Organizer seeds + generates → group stage exists: `groups-view` testid visible, "Gruppe A" + "Gruppe B" visible, and the expected number of group matches (8 players → 2 groups of 4 → 12 matches).
  - Confirm every group match via the organizer results flow (mirror how `swiss.spec.ts` confirms matches).
  - "Playoffs auslosen" button appears once the group stage is complete; click it → a playoff bracket (`BracketView`) with the 4 advancers renders.

```ts
// web/e2e/groups-playoffs.spec.ts — structure (fill fixtures by mirroring swiss.spec.ts)
import { expect, test } from "@playwright/test";
// ...same imports/fixture helpers as swiss.spec.ts, but 8 participants and format 'groups_playoffs'...

test.describe("Groups -> Playoffs", () => {
  // beforeAll: create groups_playoffs tournament + 8 checked-in adults
  // afterAll: delete the fixture tournament

  test("generates group stage, then playoffs from standings", async ({ page }) => {
    await page.goto(`/organizer/tournaments/${tournamentId}/bracket`);
    // seed + generate
    await expect(page.getByTestId("groups-view")).toBeVisible();
    await expect(page.getByText("Gruppe A")).toBeVisible();
    await expect(page.getByText("Gruppe B")).toBeVisible();

    // confirm all group matches (mirror swiss.spec.ts confirmation helper)
    // ...

    await page.getByRole("button", { name: /Playoffs auslosen/ }).click();
    // playoff bracket now present (4 advancers -> single-elim of 4)
    await expect(page.getByText("Playoffs")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the e2e.**

Run: `cd web && npx playwright test e2e/groups-playoffs.spec.ts`
Expected: PASS (group stage renders, confirming all group matches enables "Playoffs auslosen", playoff bracket appears). If the sandbox can't run a browser/dev-server, write the spec correctly and note the run is deferred to the user — but build + unit tests MUST be green.

- [ ] **Step 3: Update `docs/DEPLOY.md`.** Append a "Plan 9 — Gruppen → Playoffs" note: **one migration** `20260624090000_groups_playoffs.sql` (adds `matches.group_no`); the group stage is generated by "Bracket generieren"; once all group matches are confirmed, the organizer clicks "Playoffs auslosen" to seed the single-elim playoff from the group standings; MVP scope = `G = ceil(N/4)` groups, top 2 advance, single-elim playoff, N ≥ 6.

- [ ] **Step 4: Full verification.**

Run: `cd web && npm run build && npm test && npx playwright test`
Expected: build clean; all unit tests green (incl. the new groups files); e2e green (or deferred with reason).

- [ ] **Step 5: Commit.**

```bash
git add web/e2e/groups-playoffs.spec.ts docs/DEPLOY.md
git commit -m "feat: groups->playoffs e2e + docs"
```

---

## Self-Review

- **Spec coverage:** group stage (round-robin per group, Task 3/5), group count derivation (Task 3), per-group standings (Task 6/7), playoff seeding from standings (Task 4), playoff generation as seeded single-elim (Task 6), organizer + public views with the "generate playoffs" gate (Task 7), e2e (Task 8). One migration (Task 1).
- **MVP scope** (derived G, top-2, single-elim playoff, N≥6) is documented in the header and the DEPLOY note, not hidden.
- **Security:** `generatePlayoffs` is `requireStaff`-guarded and format-checked; pure helpers take no untrusted input; matches stay public-read / staff-write; results stay on the audited `report_match`/`confirm_match` path; the public board exposes only `display_name` + scores + status (same surface as round-robin/swiss).
- **Correctness:** group assignment, generation, and seeding are unit-tested; the playoff reuses the already-tested `generateSingleElim` + link/bye resolution (identical to `generateBracket`'s single-elim path); `generatePlayoffs` guards against missing group stage, incomplete groups, and double-generation.
- **Type consistency:** `groupCountFor`/`assignGroups`/`generateGroupStage` (groups.ts), `seedPlayoffAdvancers` (playoff-seeding.ts), `generatePlayoffs`/`ADVANCE_PER_GROUP` (actions.ts), `GroupMatch`/`GroupsView` (groups-view.tsx), `GeneratePlayoffsButton`, `matches.group_no` / `GeneratedMatch.groupNo` — used consistently.

## Done = all true
- 1 migration applied; group helpers + playoff seeding unit-tested; generating a `groups_playoffs` bracket lays down per-group round-robins; once all group matches are confirmed, the organizer generates a seeded single-elim playoff from the group standings; per-group standings + schedule + the playoff bracket render on the organizer page and the public board; build + unit tests + e2e green.
