# Double Elimination Implementation Plan (Plan 7 — Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The generator supports **Double Elimination** — a Winner Bracket (WB), a Loser Bracket (LB), and a Grand Final (GF). WB losers drop into the LB; the LB winner meets the WB winner in the GF. The organizer bracket page renders WB/LB/GF, and confirming a result advances the winner AND drops the loser into the LB.

**Architecture:** Extends Plan 4/5. `matches` gains `bracket` ('winner'|'loser'|'grand_final'), `loser_next_match_id`, `loser_next_slot`. A new pure `generateDoubleElim()` (TDD) produces the full structure with both winner- and loser-advancement refs. `confirm_match` is extended to route the loser via `loser_next_match_id`. **Scope: power-of-two entrant counts (4, 8, 16, 32).** Non-power-of-two (byes in DE) is genuinely complex and deferred — the generate action rejects it with a clear message. Single bracket-reset GF is deferred too (one GF match).

**Tech Stack:** Next.js 16 · Supabase (Postgres, RPC) · pure TS generator (Vitest) · Playwright.

---

## Prerequisites — manual dashboard steps
Apply the Task 1 migration (matches columns) AND the Task 4 migration (confirm_match update) in the SQL editor.

---

## Task 1: Schema — double-elim columns
**Files:** `supabase/migrations/20260622090000_double_elim.sql`.
```sql
alter table matches add column bracket text not null default 'winner'
  check (bracket in ('winner','loser','grand_final'));
alter table matches add column loser_next_match_id uuid references matches (id) on delete set null;
alter table matches add column loser_next_slot char(1) check (loser_next_slot in ('a','b'));
```
- [ ] Write + apply. Verify anon `select bracket from matches limit 1` works (→ []). Commit `feat: matches double-elim columns`.

## Task 2: Types
**Files:** `web/src/lib/database.types.ts`.
- [ ] Add to `matches` Row/Insert/Update: `bracket: string` (default 'winner'), `loser_next_match_id: string | null`, `loser_next_slot: string | null`. `npm run build`. Commit `feat: types for double-elim columns`.

## Task 3: `generateDoubleElim` (pure, TDD) — the core
**Files:** `web/src/lib/bracket/double-elim.ts` + `.test.ts`. Reuse `seedOrder`, `nextPow2`, the `GeneratedMatch` shape (extend it).
- [ ] Extend `GeneratedMatch` (in `types.ts`) with: `bracket: "winner" | "loser" | "grand_final"` and `loserRef: { round: number; slot: number; side: "a"|"b" } | null` (where the LOSER of this match goes; null = eliminated). Existing single-elim/round-robin generators set `bracket:"winner"` and `loserRef:null` (update them minimally; keep their tests green).
- [ ] `generateDoubleElim(participants: SeededParticipant[]): GeneratedMatch[]` for `N = participants.length` where `N` is a power of two ≥ 2 (else throw `Error("double elimination requires a power-of-two entrant count")`). Structure:
  - **WB**: a standard seeded single-elim over `N` (same pairings as `generateSingleElim`), `bracket:"winner"`, winners advance via `nextRef`, **losers drop to the LB** via `loserRef`.
  - **LB**: the standard loser-bracket for `N`: `2*(log2(N)-1)` rounds, alternating "minor" rounds (LB survivors play each other) and "major" rounds (LB survivor vs the freshly-dropped WB loser of the corresponding WB round). LB matches `bracket:"loser"`; LB losers are eliminated (`loserRef:null`); LB winners advance via `nextRef`.
  - **GF**: one match `bracket:"grand_final"`, `participant_a` = WB winner (via the WB final's `nextRef`), `participant_b` = LB winner (via the LB final's `nextRef`); no further refs. (Bracket reset deferred.)
  - Number `round` within each bracket starting at 1; `slot` 0-based within (bracket, round). `nextRef`/`loserRef` carry the target `(round, slot, side)` — but since round/slot repeat across brackets, the resolution map in the action keys on **(bracket, round, slot)**; therefore extend the ref shape to include `bracket`. Use `nextRef: { bracket, round, slot, side }` and `loserRef: { bracket, round, slot, side }`.
- [ ] **Tests (write FIRST):** ids "p1".."pN", seeds 1..N.
  - **Non-pow2 throws:** `generateDoubleElim` with N=3,5,6 throws.
  - **N=4 explicit fixture:** WB: R1 [ (1v4),(2v3) ], R2 [ WBfinal ]; LB: R1 [ loser(WB R1 m0) vs loser(WB R1 m1) ], R2 [ LBfinal: LB R1 winner vs loser(WB final) ]; GF: [ WBwinner vs LBwinner ]. Total 6 matches (WB 3 + LB 2 + GF 1). Assert each WB match's `loserRef` points to the correct LB slot; the WB final's `loserRef` points to the LB final's open side; GF `participantA`/`B` come from WB-final and LB-final `nextRef`s.
  - **N=8 invariants:** total matches = `2*8-2 = 14` (WB 7 + LB 6 + GF 1); exactly 1 `grand_final`; 7 `winner`; 6 `loser`. Every non-final WB match has a `loserRef` into a `loser` match; LB/GF have `loserRef:null`. The graph is a valid DE bracket: each LB round has the expected match count `[2,2,1,1]`, every `nextRef`/`loserRef` targets an existing `(bracket,round,slot)`, and no `(bracket,round,slot)` is targeted by more than two refs into its two sides.
  - **N=16 invariant:** total = `2*16-2 = 30` (WB 15 + LB 14 + GF 1); LB round counts `[4,4,2,2,1,1]`.
- [ ] Implement using a known-correct DE construction; run → green. Commit `feat: pure double-elimination generator with tests`.

## Task 4: confirm_match — drop the loser
**Files:** `supabase/migrations/20260622093000_confirm_match_loser.sql` (a `create or replace function public.confirm_match(...)`).
- [ ] Extend the existing `confirm_match` (keep the downstream-correction guard from `20260620...confirm_match_guard`): after setting winner + `done` + advancing the winner into `next_match`, ALSO place the **loser** into `loser_next_match_id` (side `loser_next_slot`) when that column is set. Compute loser = the participant who is NOT the winner. Same guard idea: if the loser's target match is already `done`, raise. Re-confirm overwrites the loser slot too.
- [ ] Write + apply migration. Commit `feat: confirm_match drops loser into loser bracket`.

## Task 5: generateBracket action — double_elim
**Files:** `web/src/app/organizer/tournaments/[id]/bracket/actions.ts`.
- [ ] In `generateBracket`, add the `double_elim` branch → `generateDoubleElim` (catch the non-pow2 throw → return `{error:"Double Elimination braucht 4, 8, 16 … (Zweierpotenz) eingecheckte Teilnehmer."}`). When inserting, persist `bracket`; resolve both `nextRef`→`next_match_id`/`next_slot` AND `loserRef`→`loser_next_match_id`/`loser_next_slot` (two-pass id map keyed on `(bracket,round,slot)`). Bye propagation: DE with power-of-two has no byes, so none needed. Set tournament `status='running'`. `npm run build` + `npm test`. Commit `feat: generateBracket supports double elimination`.

## Task 6: Bracket view — WB / LB / GF
**Files:** `web/src/components/brand/double-elim-view.tsx` (+ wire into the bracket page + the public board's single-elim branch).
- [ ] Presentational: three labelled sections — **Winner Bracket**, **Loser Bracket**, **Grand Final** — each rendering its matches as rounds/columns (reuse the match-card visual from `bracket-view.tsx`). On `organizer/tournaments/[id]/bracket/page.tsx` and `t/[tournamentId]/board/board-content.tsx`: when `format==='double_elim'`, render `<DoubleElimView>` (group matches by `bracket`). `npm run build`. Commit `feat(design): double-elim bracket view (WB/LB/GF)`.

## Task 7: e2e + docs
**Files:** `web/e2e/double-elim.spec.ts`, `docs/DEPLOY.md`.
- [ ] E2E: create a **double_elim** tournament fixture (insert via the organizer supabase-js client in `beforeAll`: a tournament with `format='double_elim'`, status `registration`; register + check in **4** solo adults; `afterAll` deletes the fixture tournament so the shared "Sommer Cup" is untouched). Organizer seeds + generates; assert the page shows "Winner Bracket" + "Loser Bracket" + "Grand Final" sections and 6 match cards. Optionally confirm WB R1 results and assert losers appear in the LB. Keep order-independent.
- [ ] `docs/DEPLOY.md`: append a Plan 7 note (2 migrations; DE = power-of-two only for now). Full `npm run build` + `npm test` + `npm run e2e` green. Commit `feat: double-elim e2e + docs`.

---

## Self-Review
- **Spec coverage:** Double Elimination (Phase-2 format). Power-of-two scope + deferred byes/bracket-reset documented (not hidden).
- **Security:** new columns are public-read with the rest of `matches`; generate/confirm stay staff-guarded; generator is pure.
- **Correctness:** the generator is exhaustively unit-tested (explicit N=4 fixture + N=8/16 invariants); `confirm_match` loser-drop mirrors the tested `loserRef` structure.

## Done = all true
- 2 migrations applied; `generateDoubleElim` unit-tested; organizer can generate a DE bracket (4/8/16 checked-in); WB/LB/GF render; confirming drops losers into the LB. build + test + e2e green.
