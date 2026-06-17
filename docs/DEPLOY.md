# Deploy & Setup

## Hosted Supabase (current approach — no Docker)

The app uses a hosted Supabase project ("Turnier-App"). There is no local Docker stack.

### Apply the schema
Open Supabase Dashboard → project **Turnier-App** → **SQL Editor** → paste the contents of
`supabase/migrations/20260616120000_base_schema.sql` → **Run**.
This creates the enums, `profiles`/`games`/`tournaments` tables, RLS policies, and seeds
the `games` catalog (Valorant, FIFA). The seed is idempotent (`on conflict do nothing`).

> Later, once the Supabase CLI is authenticated (`npx supabase login` + `npx supabase link
> --project-ref <ref>`), migrations can be applied with `npx supabase db push` and types
> regenerated with `npx supabase gen types typescript --linked > web/src/lib/database.types.ts`.
> Until then, `web/src/lib/database.types.ts` is hand-written to match the schema.

## Registration & Consent (Plan 2) — additional setup

Apply the migration `supabase/migrations/20260617090000_registration_consent.sql`
(SQL Editor → paste → Run). It adds `participants`/`team_members`/`consents`, RLS,
the `is_staff()` helper, storage policies, and seeds an open "Sommer Cup 2026" tournament.

Then in the Dashboard:
1. **Auth → Sign In / Providers → enable "Anonymous sign-ins"** (guest registration).
2. **Storage → create bucket `consent-signatures`, set it PRIVATE** (guardian signatures).
   Its RLS policies are created by the migration.
3. **Auth → URL Configuration → Redirect URLs:** add `http://localhost:3000/**`
   (and the Vercel preview/prod URLs) for magic-link sign-in.
4. **Organizer account:** Auth → Users → Add user (email + password), then set its role:
   ```sql
   insert into profiles (id, role, display_name)
   values ('<user-uuid>', 'organizer', 'Orga')
   on conflict (id) do update set role = 'organizer';
   ```

## Check-in (Plan 3) — additional setup

Apply `supabase/migrations/20260618090000_checkin.sql` (SQL Editor → Run). It adds the
`check_ins` audit table + `participants.qr_token`, a **consent-enforcement trigger**
(check-in is blocked at the DB unless a valid media consent exists — minor → guardian
signature), and the `check_in(participant_id, method)` RPC. No new Auth/Storage toggles
needed (anonymous auth + the `consent-signatures` bucket already exist).

Three check-in methods: organizer camera scan (`qr_scan`), station-QR self-scan
(`station`), online button (`online`). The organizer scan and station pages live under
`/organizer/tournaments/[id]/checkin` and `/t/[id]/checkin-station`; participants see
their personal QR + online button at `/t/[id]/me`.

## Generator & Brackets (Plan 4) — additional setup

Apply `supabase/migrations/20260619090000_matches.sql` (SQL Editor → Run). It adds the
`match_status` enum and the `matches` table (round/slot, `participant_a_id`/`participant_b_id`,
`winner_id`, single-elim advancement via `next_match_id`/`next_slot`, `status`), with public
read + staff write RLS. No new Auth/Storage toggles.

Bracket generation (organizer → tournament → **Bracket** tab) builds the schedule from the
tournament's **checked-in** participants (`checked_in_at not null`) in **seed** order
(`participants.seed`, 1-based). Seeding is edited on that tab ("Zufällig setzen" / manual
reorder → "Seeding speichern"); any checked-in participant without a seed is assigned one by
`created_at` so the generator receives a clean 1..N. Generating **deletes and regenerates** the
tournament's matches and flips its status to `running` (single-elim wires advancement links and
auto-advances byes; round-robin produces matchday pairings). Supported formats: `single_elim`,
`round_robin`.

## Results & Referee (Plan 5) — additional setup

Apply `supabase/migrations/20260620090000_results.sql` (SQL Editor → Run). It adds
`matches.score_a`/`score_b` (final scores), the `match_reports` table (one row per
participant per match, `unique (match_id, reported_by)`, with select RLS for staff or the
two match participants), and two `security definer` RPCs. No new Auth/Storage toggles.

**Dual report → referee confirm flow:**

- **Players report** (participant → **Mein Status** `/t/<id>/me`): when a participant has a
  current open match (both slots filled, status `pending`/`live`), a "Dein aktuelles Match"
  card lets them submit "Dein Score"/"Gegner-Score" via `report_match(p_match_id, p_score_a,
  p_score_b)`. Scores are stored in **match terms**: a side-A player's own score → `score_a`,
  a side-B player's own score → `score_b`. Resubmitting overwrites their own report (upsert).
- **Referee confirms / enters directly** (staff → **Matches** tab
  `/organizer/tournaments/<id>/matches`): each match shows the two player reports with an
  agreement badge ("✓ Einig: X:Y" when both agree, "⚠ Abweichung" on dispute). "Freigeben"
  calls `confirm_match(...)` (staff-only) — the score form is prefilled with the agreed score
  but also works as a **direct entry** with zero player reports. Draws are rejected.
- **Advancement:** `confirm_match` sets `score_a`/`score_b`, the `winner_id` and `status =
  'done'`, and (single-elim) advances the winner into `next_match` via the stored
  `next_match_id`/`next_slot`. Round-robin shows a live standings table (`computeStandings`)
  on the Matches tab.

## Live-Board & Realtime (Plan 6) — additional setup

Apply `supabase/migrations/20260621090000_realtime.sql` (SQL Editor → Run). It adds the
`matches` and `tournaments` tables to the `supabase_realtime` publication so the public
live board receives push updates. (If a table is already in the publication, run the two
`alter publication` lines individually.) No new Auth/Storage toggles.

Also apply `supabase/migrations/20260621093000_board_participants_public.sql` (SQL Editor →
Run). The board is anon and renders each match side's **display name**; the prior
`participants` RLS only let the owner/staff read those rows, so without this the board shows
"TBD" sides. It adds a public SELECT policy scoped **to the `anon` role** plus a
column-level grant limiting `anon` to `(id, tournament_id, display_name)` — so display
names are public but PII (birthdate, user_id, gamertag) stays private, and authenticated
registrants keep the stricter owner-or-staff policy.

**Public live board** (`/t/<id>/board`): a login-free beamer view. Single-elim shows the
full bracket; round-robin shows the standings table + schedule. A **"Jetzt spielbar"**
section lists matches with both participants present that aren't done yet, and an
**"Ergebnisse"** section shows decided matches' final scores with the winner highlighted.
A **Vollbild** button toggles the Fullscreen API.

The page is a server component (anon read via RLS); a thin `"use client"` wrapper opens a
Supabase Realtime channel (`board-<id>`) subscribed to `matches`/`tournaments` changes and
calls `router.refresh()` on any change, so the board updates when the referee confirms a
result. Realtime is **best-effort** — if the publication above isn't applied the board still
renders correctly and a normal reload reflects the latest state.

## Double Elimination (Plan 7) — additional setup

Apply two migrations (SQL Editor → Run, in order):

1. `supabase/migrations/20260622090000_double_elim.sql` — adds `matches.bracket`
   (`'winner' | 'loser' | 'grand_final'`, default `'winner'`) plus the loser-advancement
   links `matches.loser_next_match_id` / `matches.loser_next_slot`. Idempotent
   (`add column if not exists`).
2. `supabase/migrations/20260622093000_confirm_match_loser.sql` — replaces `confirm_match`
   so that, in addition to advancing the winner, it **drops the loser** into the loser
   bracket via the stored `loser_next_match_id` / `loser_next_slot` (keeping the Plan 5
   downstream-correction guard for both the winner's and the loser's follow-up matches).

No new Auth/Storage toggles.

**Double Elimination** supports **power-of-two** entrant counts (4 / 8 / 16 …); other counts
are rejected with a friendly message. Generation builds a Winner Bracket (the seeded
single-elim), a Loser Bracket (`2·(log2 N − 1)` rounds of alternating minor/major rounds
where WB losers drop in), and a single Grand Final fed by the WB-final and LB-final winners.
The bracket is rendered as three labelled sections (**Winner Bracket / Loser Bracket / Grand
Final**) on both the organizer **Bracket** page (`/organizer/tournaments/<id>/bracket`) and the
public **live board** (`/t/<id>/board`). Supported formats are now `single_elim`,
`round_robin`, and `double_elim`.

## Local dev

1. Create `web/.env.local` (copy `web/.env.example`) and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or sb_publishable_ key>
   ```
   (`web/.env.local` is gitignored — never commit it. Use the anon/publishable key only,
   never the `service_role` key in client env.)
2. `cd web && npm run dev` → http://localhost:3000

## Vercel

- Import the GitHub repo `DiggaX/Turnier-App`.
- **Root Directory:** `web`
- Framework preset: Next.js (auto-detected).
- Environment Variables (Production + Preview):
  - `NEXT_PUBLIC_SUPABASE_URL` = hosted Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = hosted anon/publishable key

## Tests

- Unit: `cd web && npm test` (Vitest)
- E2E: `cd web && npm run e2e` (Playwright; requires `web/.env.local` + the schema applied/seeded)
