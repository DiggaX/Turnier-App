# Live-Board & Realtime Implementation Plan (Plan 6/6 — final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, login-free live board at `/t/[id]/board` that shows a tournament's bracket (single-elim) or schedule + standings (round-robin), highlights the currently-playable matches, and **updates in real time** (Supabase Realtime) as the referee confirms results — with a beamer fullscreen mode. Closes the existing "Live-Board" link (currently 404). This is the final MVP plan.

**Architecture:** A public Server Component loads the board data; a thin client wrapper subscribes to `postgres_changes` on `matches` (filtered by tournament) and calls `router.refresh()` on any change, so the SSR'd board re-renders live. Matches are public-readable (existing RLS), so anonymous board viewers receive realtime updates. Reuses `BracketView`, `RoundRobinView`, `StandingsTable` from Plan 4/5. **Formal station management ("Aufruf an Station X") is deferred** — the board shows a "Jetzt spielbar" section instead.

**Tech Stack:** Next.js 16 (public Server Component + client realtime) · Supabase Realtime (`postgres_changes`) · Tailwind v4 + shadcn/ui · Playwright.

---

## Prerequisites — manual dashboard step (Task 1)
Enable Realtime on the `matches` (and `tournaments`) tables — a one-line SQL (Task 1). No other dashboard changes.

---

## File Structure
```
supabase/migrations/
  20260621090000_realtime.sql                 # add matches + tournaments to supabase_realtime publication
web/src/
  app/t/[tournamentId]/board/
    page.tsx                                   # PUBLIC server: load tournament + matches + participants
    live-board.tsx                             # client wrapper: realtime subscribe → router.refresh(); fullscreen toggle
    board-content.tsx                          # presentational board (live section + bracket/round-robin + standings)
  components/brand/
    (reuse bracket-view, round-robin-view, standings-table; add a small "live-match" card if needed)
  e2e/
    live-board.spec.ts                         # board renders bracket; realtime: confirm a match → board updates
docs/DEPLOY.md                                 # note: enable realtime on matches
```

---

## Task 1: Enable Realtime
**Files:** `supabase/migrations/20260621090000_realtime.sql`. Apply via dashboard SQL editor.
- [ ] **Step 1: Write the migration**
```sql
-- Enable Supabase Realtime for the live board (public board subscribes to match changes)
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table tournaments;
```
(If a table is already in the publication, the statement errors with "already member" — that's fine; the operator can run them individually. Idempotent variant: wrap each in a DO block that catches duplicate_object, or just run once on the fresh project.)
- [ ] **Step 2: Apply** in the SQL editor → Run.
- [ ] **Step 3: Verify** with a throwaway `_rtprobe.mjs` (deleted after): open a realtime channel on `matches` for the seeded tournament, then from a second connection `update` a match (needs staff — OR simply assert the channel `SUBSCRIBED` status is reached, which proves realtime is enabled). Print the subscribe status; expect `SUBSCRIBED`. Delete the probe.
- [ ] **Step 4: Commit** the migration with `feat: enable realtime on matches + tournaments`.

---

## Task 2: Public board page (server)
**Files:** `web/src/app/t/[tournamentId]/board/page.tsx`.
- [ ] `await params`; `await createClient()` (server, anon — board is public, no auth guard). Load: the tournament (`name, format, status`, `games(name)`), all `matches` for it (ordered round, slot) with a/b/winner **display names** + scores + status, and the participants (for round-robin standings). If the tournament doesn't exist → `notFound()`. If `format==='round_robin'`, compute `computeStandings` over the `done` matches.
- [ ] Render `<LiveBoard tournamentId={id}>` wrapping `<BoardContent .../>` with the loaded data. Public (no SiteNav needed, or a minimal header — it's a beamer view).
- [ ] `npm run build` green. (Commit together with Task 3/4.)

---

## Task 3: Realtime client wrapper
**Files:** `web/src/app/t/[tournamentId]/board/live-board.tsx` (`"use client"`).
- [ ] On mount (`useEffect`), create a browser client (`@/lib/supabase/client`), open a channel `board-${tournamentId}`, subscribe to `postgres_changes` `{ event: '*', schema: 'public', table: 'matches', filter: \`tournament_id=eq.${tournamentId}\` }` and also to `tournaments` (status changes) filtered by `id=eq.${tournamentId}`; on any event call `router.refresh()` (re-runs the server component → fresh board). Clean up with `supabase.removeChannel(channel)` on unmount. Guard against double-subscribe in Strict Mode (ref).
- [ ] Provide a **fullscreen** button (Fullscreen API: `document.documentElement.requestFullscreen()` / exit) and a subtle "● LIVE" indicator. Render `{children}` (the board content).

## Task 4: Board content (presentational, themed)
**Files:** `web/src/app/t/[tournamentId]/board/board-content.tsx`.
- [ ] Dark esports beamer styling (reuse tokens; reference the live-board section of `C:\Users\Rene\Turnierapp\design-refs\turnier-app.extracted.html` — "LIVE-BOARD · BEAMER-ANSICHT", running matches, bracket, standings table). Sections:
  - Header: tournament name + game + a status pill (`statusLabel`).
  - **"Jetzt spielbar"**: matches with both participants present and `status != 'done'` — large match cards (names + scores if any). If none, show a "Keine laufenden Matches" note.
  - **Bracket** (`single_elim`): `<BracketView matches>` (full tree). **Round-robin**: `<StandingsTable>` + `<RoundRobinView>`.
- [ ] Make it readable at beamer distance (large type). `npm run build` + `npm test` green.
- [ ] **Commit** Tasks 2+3+4: `feat(design): public live board with realtime updates + fullscreen`.

---

## Task 5: E2E
**Files:** `web/e2e/live-board.spec.ts`.
- [ ] Reuse the setup pattern (organizer-authenticated supabase-js client in `beforeAll` to reset the seeded "Sommer Cup 2026" to `registration`, clear matches/reports; `afterAll` restore). Steps: register + check in 2 solo adults, organizer seeds + generates (1 final, both slots). (a) `goto('/t/<id>/board')` and assert the bracket / both participant names render and the status pill shows. (b) **Realtime test:** with the board page still open, use the organizer supabase-js client to `confirm_match` that final (score 2:1) → assert the board updates to show the winner / "2:1" within a generous timeout (e.g. `await expect(page.getByText('2:1')).toBeVisible({ timeout: 15000 })`). If realtime proves flaky in CI, fall back to a `page.reload()` before the assertion and clearly comment that the realtime push is best-effort (the subscription is wired; the reload guarantees the data path).
- [ ] Keep the suite order-independent and green.

## Task 6: Docs
- [ ] `docs/DEPLOY.md`: append a Plan 6 note (run `20260621090000_realtime.sql` to enable realtime; the board at `/t/[id]/board` is public + live).
- [ ] Full `npm run build` + `npm test` + `npm run e2e` green. Commit `feat: live board e2e + docs`.

---

## Self-Review (after writing all tasks)
- **Spec coverage:** public live-board (§10) — bracket, live matches, standings, realtime auto-update, beamer fullscreen. Station calls deferred (documented). Closes the home/detail "Live-Board" link.
- **Security:** board is public read-only; realtime rides the existing public-read RLS on `matches`/`tournaments`; no writes from the board.
- **Type/name consistency:** reuses `BracketView`/`RoundRobinView`/`StandingsTable`/`computeStandings`/`statusLabel`.
- **Testability honesty:** realtime is e2e-tested via a real confirm→update, with a documented reload fallback if flaky.

## Done = all true
- Realtime enabled on `matches`; board page public at `/t/[id]/board` (no 404).
- Board shows bracket/standings + live matches, themed for beamer, with a fullscreen toggle.
- Confirming a result updates the open board live (e2e). `npm run build` + `npm test` + `npm run e2e` all green.
- **MVP complete: Plans 1–6 done.**
