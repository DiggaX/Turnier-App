# Generator & Brackets Implementation Plan (Plan 4/6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organizer seeds the **checked-in** participants of a tournament (random or manual order) and generates a bracket/schedule — **Single Elimination** (with byes for non-power-of-2) or **Round Robin** — which is stored as `matches` and shown on the organizer's bracket page; generating moves the tournament to `running`.

**Architecture:** A new `matches` table holds the structure (round, slot, the two participants, winner, next-match link, status). The bracket math lives in PURE, unit-tested functions (`web/src/lib/bracket/`) — no I/O. A staff-guarded server action loads checked-in participants ordered by `participants.seed`, runs the pure generator, and inserts the matches in one go. Results/scores are NOT part of this plan (Plan 5) — matches are generated empty (byes auto-resolve their winner).

**Tech Stack:** Next.js 16 (server actions) · Supabase (Postgres, RLS) · pure TS generators (Vitest) · Tailwind v4 + shadcn/ui · Playwright.

---

## Prerequisites — manual dashboard step
Apply the Task 1 migration in the Supabase SQL Editor (paste → Run). No Auth/Storage changes.

---

## File Structure
```
supabase/migrations/
  20260619090000_matches.sql                 # match_status enum, matches table + RLS
web/src/
  lib/
    database.types.ts                         # + matches, match_status (hand-written)
    bracket/
      seed-order.ts        seed-order.test.ts # standard bracket seed slot order
      single-elim.ts       single-elim.test.ts# generateSingleElim()
      round-robin.ts       round-robin.test.ts# generateRoundRobin()
      types.ts                                 # GeneratedMatch shape (pre-DB)
  app/organizer/tournaments/[id]/bracket/
    page.tsx                                   # server: staff guard, load checked-in + existing matches
    seeding-client.tsx                         # random/manual seed UI + persist
    generate-button.tsx                        # client: calls the generate action
    actions.ts                                 # server actions: saveSeeds(), generateBracket()
  components/brand/
    bracket-view.tsx                           # single-elim bracket render (reused later by live-board)
    round-robin-view.tsx                       # round-robin schedule/table render
  e2e/
    bracket-generate.spec.ts                   # checkin 2 → organizer seed + generate → bracket renders
docs/DEPLOY.md                                 # note: apply matches migration
```

---

## Task 1: Schema — matches table

**Files:** `supabase/migrations/20260619090000_matches.sql`. Apply via dashboard SQL editor.

- [ ] **Step 1: Write the migration**
```sql
create type match_status as enum ('pending', 'live', 'done', 'bye');

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  round int not null,                 -- 1 = first round / matchday 1
  slot int not null,                  -- position within the round (0-based)
  participant_a_id uuid references participants (id) on delete set null,
  participant_b_id uuid references participants (id) on delete set null,
  winner_id uuid references participants (id) on delete set null,
  next_match_id uuid references matches (id) on delete set null,  -- single-elim advancement
  next_slot char(1) check (next_slot in ('a','b')),               -- which side the winner feeds
  status match_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index matches_tournament_idx on matches (tournament_id, round, slot);

alter table matches enable row level security;
-- public read (needed for the live-board later); staff write
create policy "matches_select_public" on matches for select using (true);
create policy "matches_write_staff" on matches
  for all using (public.is_staff()) with check (public.is_staff());
```

- [ ] **Step 2: Apply** in the SQL editor → Run. Expect "Success".
- [ ] **Step 3: Verify** via a throwaway `_probe.mjs` (anon can SELECT matches → empty array, not a missing-table error): `await c.from("matches").select("id").limit(1)` prints `[]`. Delete the probe.
- [ ] **Step 4: Commit** `supabase/migrations/20260619090000_matches.sql` with message `feat: matches schema + RLS`.

---

## Task 2: Extend DB types
**Files:** `web/src/lib/database.types.ts`.
- [ ] Add `export type MatchStatus = "pending" | "live" | "done" | "bye";`. Add a `matches` Tables entry: Row `{ id, tournament_id, round, slot, participant_a_id: string|null, participant_b_id: string|null, winner_id: string|null, next_match_id: string|null, next_slot: string|null, status: MatchStatus, created_at }`; Insert/Update accordingly; Relationships for `tournament_id`→tournaments, `next_match_id`→matches (self). Add `match_status: MatchStatus` to Enums.
- [ ] `npm run build` passes. Commit `feat: extend DB types with matches`.

---

## Task 3: Bracket generation logic (pure, TDD)
**Files:** `web/src/lib/bracket/{types,seed-order,single-elim,round-robin}.ts` + `.test.ts`. NO I/O — pure functions over `{ id, seed }`.

`types.ts`:
```ts
export interface SeededParticipant { id: string; seed: number } // seed 1..N, 1 = top
export interface GeneratedMatch {
  round: number; slot: number;
  participantAId: string | null; participantBId: string | null;
  winnerId: string | null;                 // set only for byes
  status: "pending" | "bye";
  nextRef: { round: number; slot: number; side: "a" | "b" } | null; // single-elim link (resolved to ids after insert)
}
```

### 3a — `seedOrder(size)` (TDD)
Standard bracket slot order for a power-of-2 `size`. Recursive: `seedOrder(2) = [1,2]`; for larger, map each `x` in `seedOrder(size/2)` to `[x, size+1-x]` and flatten.
- [ ] Failing tests: `seedOrder(2)` → `[1,2]`; `seedOrder(4)` → `[1,4,2,3]`; `seedOrder(8)` → `[1,8,4,5,2,7,3,6]`; `seedOrder(n)` is a permutation of `1..n` and `seedOrder(n)[2k] + seedOrder(n)[2k+1] === n+1` for all pairs.
- [ ] Implement, run → green.

### 3b — `generateSingleElim(participants)` (TDD)
Input ordered by seed (caller passes seed order). `size = nextPow2(N)`, `byes = size - N`.
- Round 1: for each pair `(seedOrder[2i], seedOrder[2i+1])`, map seed→participant (seed > N ⇒ null = bye). If exactly one side present ⇒ `status:"bye"`, `winnerId` = present participant. If both present ⇒ `status:"pending"`. If both null (can't happen for byes ≤ size/2) ⇒ skip/guard.
- Rounds `2..log2(size)`: empty `pending` matches. Link each match `(r, j)` to `(r+1, floor(j/2))` side `a` if `j` even else `b` via `nextRef`.
- [ ] Failing tests:
  - N=2 → 1 match, both present, pending, no nextRef.
  - N=4 → round1: 2 matches (seeds 1v4, 2v3); round2: 1 final; round-1 matches link to final (slots 0→a, 1→b).
  - N=3 → size 4, 1 bye: top seed (seed 1) gets a bye match (status "bye", winner = seed1), seed 2 vs 3 pending; final links.
  - N=6 → size 8, 2 byes on seeds 1 and 2; assert total matches = size-1 = 7, bye count = 2, every non-final match has a nextRef, final has none, and the bracket is a valid binary tree (each round r has size/2^r matches).
  - N=8 → 7 matches, 0 byes, pairing follows seedOrder(8).
- [ ] Implement (`nextPow2`, build rounds, link nextRef), run → green.

### 3c — `generateRoundRobin(participants)` (TDD)
Circle method. If N odd, pad with a `null` "bye" slot. `rounds = (padded? N : N-1)`; each round rotate. Output one `GeneratedMatch` per real pair (skip pairings involving the padding), `round` = matchday (1-based), `slot` = index within the matchday, `status:"pending"`, `nextRef:null`.
- [ ] Failing tests: N=4 → 6 matches over 3 rounds, every unordered pair exactly once; N=3 → 3 matches over 3 rounds (each round one real match + one bye-skip); N=5 → 10 matches; assert no self-pairings and no duplicate unordered pairs.
- [ ] Implement, run → green.

- [ ] **Commit** all of Task 3: `feat: pure bracket generators (single-elim + round-robin) with tests`.

---

## Task 4: Seeding (organizer)
**Files:** `web/src/app/organizer/tournaments/[id]/bracket/seeding-client.tsx` + `actions.ts` (`saveSeeds`).
- [ ] `actions.ts` `saveSeeds(tournamentId, orderedParticipantIds: string[])` — `"use server"`, staff-guard (getUser + profiles role), update each participant's `seed` = its index+1 (1-based). Validate all ids belong to the tournament and are checked-in.
- [ ] `seeding-client.tsx` (client): shows the checked-in participants in current seed order; a **"Zufällig setzen"** button (Fisher–Yates shuffle) and **manual reorder** (up/down buttons are fine — no dnd lib needed); a **"Seeding speichern"** button → `saveSeeds`. Only checked-in participants are listed.
- [ ] No new e2e yet (covered by Task 6 flow). `npm run build` + `npm test` green. Commit `feat: bracket seeding (random + manual) for checked-in participants`.

---

## Task 5: Generate action
**Files:** `web/src/app/organizer/tournaments/[id]/bracket/actions.ts` (`generateBracket`).
- [ ] `generateBracket(tournamentId)` — `"use server"`, staff-guard. Load the tournament's `format` + checked-in participants ordered by `seed` (nulls last → assign sequential seeds if unseeded). Require ≥ 2 → else return an error ("Mindestens 2 eingecheckte Teilnehmer nötig."). Pick generator by `format` (`single_elim` → `generateSingleElim`; `round_robin` → `generateRoundRobin`; other formats → error "Format noch nicht unterstützt" for now). DELETE existing matches for the tournament (regenerate), then INSERT the generated matches; for single-elim resolve `nextRef`→`next_match_id`/`next_slot` after insert (two-pass: insert to get ids by (round,slot), then update next links). Set tournament `status = 'running'`. Return success.
- [ ] Unit-test the `nextRef`→id resolution helper if you extract one (pure mapping from generated matches + inserted-id map). `npm run build` + `npm test` green. Commit `feat: generateBracket server action (checked-in, by format, sets running)`.

---

## Task 6: Bracket page + views (organizer)
**Files:** `web/src/app/organizer/tournaments/[id]/bracket/page.tsx`, `generate-button.tsx`, `web/src/components/brand/bracket-view.tsx`, `round-robin-view.tsx`. Enable the **Bracket** tab in `web/src/components/brand/tournament-tabs.tsx` (currently a disabled span).
- [ ] `page.tsx` (Server, staff-guard + `OrganizerNav` + `TournamentTabs`): load tournament (with `format`, `status`), checked-in participants, and existing `matches` (with participant display names). If no matches yet → show `<SeedingClient>` + `<GenerateButton>`. If matches exist → show the bracket: `single_elim` → `<BracketView>` (rounds as columns, match cards with the two names + bye/“TBD”), `round_robin` → `<RoundRobinView>` (matchday list). Style with the dark esports theme (reuse the match-card visual from `design-refs/turnier-app.extracted.html` live-board section). Include a "Neu generieren" affordance (guarded — warns it replaces existing matches).
- [ ] `generate-button.tsx` (client): calls `generateBracket`, shows pending/error, refreshes on success.
- [ ] Enable the Bracket tab link.
- [ ] `npm run build` + `npm test` green. Commit `feat(design): organizer bracket page + bracket/round-robin views`.

---

## Task 7: E2E + docs
**Files:** `web/e2e/bracket-generate.spec.ts`, `docs/DEPLOY.md`.
- [ ] E2E: in one test — (1) register + check in TWO solo adult participants (reuse the register + checkin-online flows in fresh contexts, or two sequential anon registrations+online check-ins), then (2) log in as organizer, open `/organizer/tournaments/<id>/bracket`, click "Zufällig setzen" → "Seeding speichern" → "Generieren", and assert a match card showing the two participants (or the bracket grid) renders and the tournament shows `running`. Note: the seeded "Sommer Cup 2026" is `single_elim`, so this exercises the single-elim path. (Round-robin generation is covered by unit tests; optionally add a second tournament fixture if easy, else rely on units.)
- [ ] `docs/DEPLOY.md`: add "apply `20260619090000_matches.sql`; bracket generation uses checked-in participants + `participants.seed`."
- [ ] Full `npm run build` + `npm test` + `npm run e2e` green. Commit `feat: bracket generation e2e + docs`.

---

## Self-Review (after writing all tasks)
- **Spec coverage:** generator (single-elim + round-robin), seeding (random + manual), checked-in-only, bracket display. Spec §8 (MVP formats) covered; Swiss/groups deferred (Phase 2). Results/scores are Plan 5.
- **Security:** matches public-read (for live-board) + staff-write; generate/seed actions staff-guarded; the generators are pure (no auth surface).
- **Type/name consistency:** `generateSingleElim`/`generateRoundRobin`/`seedOrder`/`GeneratedMatch`/`saveSeeds`/`generateBracket`/`next_match_id` reused across tasks.
- **Testability:** generation correctness is exhaustively unit-tested (the algorithmic core); the e2e covers the organizer happy path for single-elim.

## Done = all true
- Migration applied; `matches` exists (public read, staff write).
- Pure generators unit-tested (seedOrder, single-elim byes + links, round-robin pairs).
- Organizer can seed (random/manual) + generate; matches persist; tournament → `running`; bracket renders. e2e green.
- `npm run build` + `npm test` + `npm run e2e` all green.
