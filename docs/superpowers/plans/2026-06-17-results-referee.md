# Ergebnisse & Schiri-Flow Implementation Plan (Plan 5/6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both sides of a match submit their score; a referee/organizer confirms (one tap if the two reports agree, dispute-resolve if not) **or** enters the result directly; on confirmation the match is `done`, the winner is set, and (single-elim) the winner auto-advances to the next match. Round-robin tournaments get a live standings table.

**Architecture:** New `match_reports` (per-side score submissions); `matches` gains `score_a`/`score_b`. Two SECURITY DEFINER RPCs: `report_match` (a match participant submits/updates their own report) and `confirm_match` (staff-only: writes the final score+winner, sets `done`, advances the winner into `next_match` for single-elim). Standings are a PURE, unit-tested function over the tournament's done matches. Builds on Plan 4's `matches`.

**Tech Stack:** Next.js 16 (server-side RPC calls) · Supabase (Postgres RPCs + RLS) · pure TS standings (Vitest) · Tailwind v4 + shadcn/ui · Playwright.

---

## Prerequisites — manual dashboard step
Apply the Task 1 migration in the Supabase SQL Editor (paste → Run). No Auth/Storage changes.

---

## File Structure
```
supabase/migrations/
  20260620090000_results.sql                  # matches.score_a/b, match_reports + RLS, report_match + confirm_match RPCs
web/src/
  lib/
    database.types.ts                          # + match_reports, score cols, RPC types
    standings.ts  standings.test.ts            # pure round-robin standings
  app/
    t/[tournamentId]/me/ (me-client.tsx)        # add "Dein aktuelles Match" + score report form
    organizer/tournaments/[id]/matches/
      page.tsx                                  # referee: matches list + reports + confirm/dispute/direct entry
      confirm-form.tsx                          # client: confirm_match score form
      report-row.tsx                            # presentational match row with reports + agreement/dispute
  components/brand/
    standings-table.tsx                         # round-robin standings (reused by live-board later)
    tournament-tabs.tsx                         # enable the "Matches" tab
  e2e/
    results-flow.spec.ts                        # 2 players report → referee confirms → match done + winner
docs/DEPLOY.md                                  # note: apply results migration
```

---

## Task 1: Schema — match_reports, scores, RPCs

**Files:** `supabase/migrations/20260620090000_results.sql`. Apply via dashboard SQL editor.

- [ ] **Step 1: Write the migration**
```sql
alter table matches add column score_a int;
alter table matches add column score_b int;

create table match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  reported_by uuid not null references participants (id) on delete cascade,
  score_a int not null check (score_a >= 0),
  score_b int not null check (score_b >= 0),
  created_at timestamptz not null default now(),
  unique (match_id, reported_by)
);
alter table match_reports enable row level security;
-- staff OR one of the match's two participant-owners may read
create policy "match_reports_select" on match_reports for select using (
  public.is_staff() or exists (
    select 1 from matches m
    join participants p on p.id in (m.participant_a_id, m.participant_b_id)
    where m.id = match_id and p.user_id = auth.uid()
  )
);
-- no INSERT policy: writes go through report_match() only

-- participant submits/updates their own report for a match they're in
create or replace function public.report_match(p_match_id uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  select p.id into v_pid from matches m
    join participants p on p.id in (m.participant_a_id, m.participant_b_id)
    where m.id = p_match_id and p.user_id = auth.uid()
    limit 1;
  if v_pid is null then raise exception 'not a participant in this match'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;
  insert into match_reports (match_id, reported_by, score_a, score_b)
    values (p_match_id, v_pid, p_score_a, p_score_b)
    on conflict (match_id, reported_by)
      do update set score_a = excluded.score_a, score_b = excluded.score_b, created_at = now();
end;
$$;
grant execute on function public.report_match(uuid, int, int) to anon, authenticated;

-- staff confirms / directly enters the final result; sets winner, done, advances (single-elim)
create or replace function public.confirm_match(p_match_id uuid, p_score_a int, p_score_b int)
returns void language plpgsql security definer set search_path = public as $$
declare m matches; v_winner uuid;
begin
  if not public.is_staff() then raise exception 'only staff may confirm results'; end if;
  select * into m from matches where id = p_match_id;
  if m.id is null then raise exception 'match not found'; end if;
  if p_score_a < 0 or p_score_b < 0 then raise exception 'invalid score'; end if;
  if p_score_a = p_score_b then raise exception 'draw not allowed'; end if;
  if m.participant_a_id is null or m.participant_b_id is null then raise exception 'match has an empty slot'; end if;
  v_winner := case when p_score_a > p_score_b then m.participant_a_id else m.participant_b_id end;
  update matches set score_a = p_score_a, score_b = p_score_b, winner_id = v_winner, status = 'done' where id = p_match_id;
  if m.next_match_id is not null then
    if m.next_slot = 'a' then update matches set participant_a_id = v_winner where id = m.next_match_id;
    elsif m.next_slot = 'b' then update matches set participant_b_id = v_winner where id = m.next_match_id;
    end if;
  end if;
end;
$$;
grant execute on function public.confirm_match(uuid, int, int) to authenticated;
```

- [ ] **Step 2: Apply** → Run. Expect "Success".
- [ ] **Step 3: Verify** with a throwaway `_probe.mjs` (delete after): anon `select` on `match_reports` returns `[]` (table exists); calling `confirm_match` as anon errors with "only staff may confirm results". Delete the probe.
- [ ] **Step 4: Commit** the migration with `feat: results schema (match_reports, scores, report_match + confirm_match RPCs)`.

---

## Task 2: Extend DB types
**Files:** `web/src/lib/database.types.ts`.
- [ ] Add `score_a: number | null` and `score_b: number | null` to the `matches` Row (and `?` in Insert/Update). Add a `match_reports` table entry (Row `{ id, match_id, reported_by, score_a: number, score_b: number, created_at }`, Insert/Update, Relationships → matches + participants). Add the two RPCs to `Functions`: `report_match` (Args `{ p_match_id: string; p_score_a: number; p_score_b: number }`, Returns undefined) and `confirm_match` (same Args). `npm run build` green. Commit `feat: extend DB types with match_reports + result RPCs`.

---

## Task 3: Standings logic (pure, TDD)
**Files:** `web/src/lib/standings.ts` + `standings.test.ts`.
```ts
export interface StandingRow {
  participantId: string; played: number; wins: number; losses: number;
  scoreFor: number; scoreAgainst: number; diff: number;
}
export interface DoneMatch { participantAId: string; participantBId: string; scoreA: number; scoreB: number }
export function computeStandings(matches: DoneMatch[]): StandingRow[]
```
- Only fully-decided matches are passed in (caller filters `status==='done'` with both ids + scores). For each, add a played/win/loss + scoreFor/scoreAgainst to both participants; `diff = scoreFor - scoreAgainst`. Return rows **sorted** by wins desc, then diff desc, then scoreFor desc (stable; ties keep insertion order).
- [ ] Failing tests first: a 3-player round-robin (A beats B 2:0, A beats C 2:1, B beats C 2:1) → A 2-0 (#1), B 1-1, C 0-2, correct diffs and ordering; empty input → `[]`; verify each participant's played count and that `wins+losses===played` (no draws).
- [ ] Implement, run → green. Commit `feat: round-robin standings logic with tests`.

---

## Task 4: Participant match report (on /me)
**Files:** modify `web/src/app/t/[tournamentId]/me/page.tsx` + `me-client.tsx`.
- [ ] On `page.tsx`, additionally load the participant's **current open match**: a `matches` row in this tournament where (`participant_a_id` or `participant_b_id`) = the participant, `status in ('pending','live')`, and both slots filled; include the opponent's display name and the participant's existing `match_reports` row (if any). Pass to client.
- [ ] In `me-client.tsx`, if there's a current open match, render a **"Dein aktuelles Match"** card: opponent name, two score inputs (dein Score / Gegner-Score — map to score_a/score_b by which side the participant is), a **"Ergebnis melden"** button → `supabase.rpc("report_match", { p_match_id, p_score_a, p_score_b })`. After submit show "Gemeldet: X:Y — wartet auf Freigabe" and allow editing (re-submit). Friendly German errors. (No bracket/score is shown to the participant beyond their own match.)
- [ ] Extend `web/e2e/checkin-online.spec.ts` is NOT required; the results e2e (Task 7) covers reporting. `npm run build` + `npm test` green. Commit `feat: participant match result reporting on /me`.

---

## Task 5: Referee matches page + confirm/dispute/direct entry
**Files:** `web/src/app/organizer/tournaments/[id]/matches/page.tsx`, `confirm-form.tsx`, `report-row.tsx`; enable the **Matches** tab in `tournament-tabs.tsx`.
- [ ] `page.tsx` (Server, staff-guard + `OrganizerNav` + `TournamentTabs`): load the tournament's `matches` (with a/b/winner display names, scores, status) ordered by round/slot, and all `match_reports` for those matches. For each match render a `<ReportRow>`: the two participants, both reports if present, an **agreement badge** (✓ "Einig: X:Y" when both reports match) / **dispute badge** ("⚠ Abweichung" when they differ) / "warten auf Meldungen", and a `<ConfirmForm>` with two score inputs **prefilled with the agreed score when reports agree**, a **"Freigeben"** button. The same form serves **direct entry** (referee types a score with no player reports). Decided matches (`status==='done'`) show the final score + winner, no form.
- [ ] `confirm-form.tsx` (client): calls `supabase.rpc("confirm_match", { p_match_id, p_score_a, p_score_b })`, pending/error, `router.refresh()` on success. Disallow a draw client-side too (the RPC also rejects it).
- [ ] Enable the **Matches** tab link.
- [ ] `npm run build` + `npm test` green. Commit `feat(design): referee matches page — confirm/dispute/direct entry + advancement`.

---

## Task 6: Standings view (round-robin)
**Files:** `web/src/components/brand/standings-table.tsx`; show it on the matches page (and/or bracket page) for `round_robin` tournaments.
- [ ] `standings-table.tsx` (presentational): takes `StandingRow[]` + a participantId→name map, renders the dark-themed table (Rang, Team, Sp, S, N, +/−, Diff). Compute via `computeStandings` from done matches in the page server component, for `round_robin` tournaments only.
- [ ] Show it at the top of the matches page when `format==='round_robin'`. `npm run build` + `npm test` green. Commit `feat(design): round-robin standings table`.

---

## Task 7: E2E + docs
**Files:** `web/e2e/results-flow.spec.ts`, `docs/DEPLOY.md`.
- [ ] E2E (single-elim, seeded "Sommer Cup 2026"): reuse `bracket-generate.spec.ts`'s setup (reset tournament to `registration` + clear matches in `beforeAll`, restore in `afterAll`; register + check in **2** solo adults; organizer seeds + generates → 1 final match). Then: as the two participants (their browser contexts/anon sessions), open `/t/<id>/me`, submit agreeing scores via "Ergebnis melden". Then as organizer, open `/organizer/tournaments/<id>/matches`, assert the agreement badge shows the agreed score, click "Freigeben", and assert the match shows `done` with the winner. (Advancement to a next match isn't exercised with N=2 — the final has no next_match; the `confirm_match` advancement logic is covered by a throwaway `_probe.mjs` that generates a 4-player bracket and confirms a round-1 match, asserting the winner appears in the round-2 match, then deletes itself. Document this.)
- [ ] `docs/DEPLOY.md`: append a Plan 5 note (apply `20260620090000_results.sql`; dual-report + referee confirm; advancement on confirm).
- [ ] Full `npm run build` + `npm test` + `npm run e2e` green (keep the suite order-independent like the bracket spec). Commit `feat: results flow e2e + docs`.

---

## Self-Review (after writing all tasks)
- **Spec coverage:** dual-report (both sides) + referee one-tap confirm on agreement + dispute resolution + referee direct entry (§9); single-elim winner advancement; round-robin standings. Scores captured.
- **Security:** `report_match` restricted to a match's participants; `confirm_match` staff-only; `match_reports` RLS scoped to staff + participants; advancement only via the staff RPC.
- **Type/name consistency:** `report_match`/`confirm_match`/`computeStandings`/`StandingRow`/`score_a`/`score_b` reused across tasks.
- **Testability:** standings pure-unit-tested; results flow e2e (report→confirm→done); advancement probe-tested.

## Done = all true
- Migration applied; `match_reports` + score cols + both RPCs exist; anon `confirm_match` is rejected.
- Participant can report their match; referee sees agreement/dispute, confirms (one tap) or enters directly; match → `done`, winner set, single-elim advances.
- Round-robin standings table renders from done matches.
- `npm run build` + `npm test` + `npm run e2e` all green.
