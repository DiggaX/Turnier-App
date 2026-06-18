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

## Swiss System (Plan 8) — no migration required

**No migration.** The `tournament_format` enum already includes `'swiss'` (declared in
`20260616120000_base_schema.sql`) and the `matches` table already supports byes
(`status = 'bye'`, nullable `participant_b_id`) — single-elim already emits them.
This plan is application code only.

**How Swiss works:**

- `R = ceil(log2(N))` rounds are played (e.g. 4 entrants → 2 rounds, 8 → 3 rounds).
- No one is eliminated; the final standings after all `R` rounds decide the winner.
- Odd entrant counts give the lowest-ranked bye-less player a **bye** (free win) each round.
- Round 1 is generated from the bracket page like any other format (seed → "Generieren").
- The organizer **advances** rounds from the bracket page: once every match in the current
  round is decided (`done` or `bye`), a **"Nächste Runde auslosen"** button appears. Clicking
  it computes the next round's pairings from the live standings (avoiding rematches and
  repeat byes) and inserts the new matches.
- Results use the existing `report_match` / `confirm_match` flow — no RPC changes.
- Both the organizer **Bracket** page and the public **live board** render a
  **standings table** (byes counted as wins) plus a **per-round schedule**.
- After all `R` rounds are played the advance button is replaced by
  "Alle R Runden gespielt — Endstand steht."

Supported formats are now `single_elim`, `round_robin`, `double_elim`, and `swiss`.

## Groups → Playoffs (Plan 9) — one migration required

Apply `supabase/migrations/20260624090000_groups_playoffs.sql` (SQL Editor → Run). It adds
`matches.group_no` (integer, nullable) to the `matches` table. This single column is the
only schema change: the group number of a group-stage match (0-based); playoff matches
leave it `NULL`. The column is added with `if not exists` so the migration is idempotent.

No new Auth/Storage toggles needed.

**How Groups → Playoffs works:**

- **Group count** `G = ceil(N/4)` (target ~4 per group, minimum 2 groups). Requires **N ≥ 6**;
  smaller fields are rejected with a friendly error.
- **Group assignment:** participants (sorted by seed) are snake-distributed so group strength
  is balanced: seeds 1..G go to groups 0..G−1, the next G seeds fill in reverse, and so on.
- **Group stage:** a full round-robin within each group (`C(|group|, 2)` matches each).
  Generated by "Bracket generieren" — identical flow to other formats (seed → save → generate).
  Each match is tagged with its `group_no` so per-group standings can be computed at any time.
- **Confirmation:** group matches use the same `report_match` / `confirm_match` flow as all
  other formats — no changes for players or referees.
- **Playoffs:** once every group match is `done` or `bye`, a **"Playoffs auslosen →"** button
  appears on the organizer Bracket page. Clicking it:
  1. Computes the live per-group standings from confirmed results.
  2. Takes the top **2** finishers from each group (MVP scope; not configurable in this release).
  3. Seeds them for a fair bracket: group winners first (in group order), then runners-up in
     **reverse** group order — so a group winner can only meet their group's runner-up in the
     final rounds.
  4. Generates a seeded **single-elimination** bracket from the advancers (byes are inserted
     automatically if `2G` is not a power of two).
  5. Inserts the playoff matches (with `group_no = NULL`) and wires advancement + bye links
     exactly like a standalone single-elim tournament.
- **Organizer Bracket page** and **public live board** render:
  - A **GroupsView**: one section per group — per-group standings table + match schedule
    (decided matches show the final score; winner highlighted in lime).
  - Once playoffs are generated: a **"Playoffs"** section with the single-elim bracket
    (`BracketView`).

Supported formats are now `single_elim`, `round_robin`, `double_elim`, `swiss`, and
`groups_playoffs`.

## Plan 10 — Web Push

### Schema migration

Apply **both** migrations in order (SQL Editor → Run each separately):

1. `supabase/migrations/20260625090000_push_subscriptions.sql` — creates the
   `push_subscriptions` table (one row per participant/endpoint pair), enables RLS, and adds
   three policies: participants may insert and delete their own subscriptions; staff may select
   and delete any subscription (needed for delivery and stale-subscription pruning).

2. `supabase/migrations/20260626090000_push_subscriptions_update_policy.sql` — adds the
   fourth policy: participants may update their own subscription row. **This policy is required
   for idempotent re-subscription.** Without it, the `upserted by endpoint` upsert
   (`onConflict: 'endpoint'`) is denied on the UPDATE path when an endpoint already exists,
   causing re-clicking "Benachrichtigungen aktivieren" to silently fail.

No new Auth/Storage toggles are needed beyond what Plans 2–9 already enable.

### VAPID environment variables

Generate a VAPID key pair once:

```bash
npx web-push generate-vapid-keys
```

Then add all three values to **`web/.env.local`** (local dev) AND to the **Vercel project
environment** (Production + Preview):

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The public VAPID key (URL-safe base64). Exposed to the browser — safe to be public. |
| `VAPID_PRIVATE_KEY` | The private VAPID key. **Server-only** — never include in `NEXT_PUBLIC_*`. |
| `VAPID_SUBJECT` | Contact URI, e.g. `mailto:admin@example.com`. Identifies the push sender to browser vendors. |

### How it works

- **Players opt in** on their personal tournament page (`/t/<id>/me`). A
  "Match-Benachrichtigungen" card shows a button "Benachrichtigungen aktivieren". Clicking
  it registers the service worker (`/sw.js`), requests the browser notification permission,
  subscribes via the Push API, and stores the encrypted subscription in `push_subscriptions`
  via the `subscribeParticipant` server action. The subscription is **upserted by endpoint**,
  so re-clicking is idempotent.
- **Staff push** via the **"Spielbare Matches benachrichtigen"** button on the organizer
  matches page (`/organizer/tournaments/<id>/matches`). The `notifyPlayableMatches` server
  action selects all matches whose status is `pending` or `live` with both participant slots
  filled, collects their subscriptions from `push_subscriptions`, and sends each a
  VAPID-signed push via the `web-push` library. Subscriptions that respond with HTTP 404 or
  410 (expired/unsubscribed) are automatically pruned.
- The service worker (`public/sw.js`) renders incoming pushes as OS notifications and
  focuses or opens the app URL on click.

### Graceful degradation (no VAPID keys configured)

The feature degrades safely when the VAPID environment variables are absent:

- The opt-in card shows a disabled button and the message "Push ist noch nicht konfiguriert."
- The notify action returns `{ error: "Push ist nicht konfiguriert (VAPID-Keys fehlen)." }`
  and shows it in the UI without crashing.
- The build and all unit tests pass without any VAPID keys set.

### MVP scope and deferred work

This release covers: manual staff-triggered delivery for all participants with a currently
playable match. The following are **deferred** for a later plan:

- Auto-send when a result is confirmed or a new round is generated (would hook each result
  action — significant blast radius).
- Per-event or per-participant notification preferences.
- Team-wide fan-out (notify all registered teammates, not just the playing participant).

### iOS note

Web Push on iOS 16.4+ requires the site to be **added to the Home Screen** (installed PWA).
Notifications will not appear in Safari without this step. Instruct participants
accordingly.

## Plan 11 — Result Stations

**No migration.** The `confirm_match` RPC and `matches` Realtime publication are
already in place from Plans 5 and 6.

The organizer **"Stationen"** tab (previously dimmed) opens a fullscreen result-station
kiosk at `/organizer/tournaments/<id>/station`. It lists every **playable** match
(both opponent slots filled, status `pending` or `live`) as large touch-friendly cards.
A referee at the match table enters the score directly (no player reports needed) and
clicks **"Freigeben"** — this calls the existing staff-only `confirm_match` RPC, sets
`winner_id` / `score_a` / `score_b`, and advances the winner in single-elim brackets,
exactly as the organizer Matches tab does.

A Supabase Realtime channel (`station-<id>`) subscribes to `matches` changes and calls
`router.refresh()` on any update, so confirmed matches drop off all open station windows
and the public board simultaneously. Realtime is best-effort — a normal reload always
reflects the latest state.

Access is staff-gated (`admin` / `organizer` / `referee` profile role), identical to the
other organizer pages. `confirm_match` itself enforces `is_staff()` in the RPC body (RLS
defense in depth). No PII beyond `display_name` and scores is shown.

The kiosk also provides a **⛶ Vollbild** button using the Fullscreen API for tablet or
monitor deployment.

## Organizer-Admin (Modul 1) — one migration required

Apply `supabase/migrations/20260627090000_organizer_admin.sql` (SQL Editor → Run). It makes
two changes:

1. **`tournaments.team_size` column** — `int not null default 1`, check `team_size >= 1`.
   Team size is now stored per-tournament; the seeded game value is only used as a default
   in the create form. Existing rows default to `1`.

2. **RLS hardening for `tournaments` and `games`** — the prior write policies allowed any
   authenticated user (including anonymous players) to insert/update/delete these rows. They
   are replaced with staff-only policies (`is_staff()` — `admin`, `organizer`, or `referee`
   role). This closes a security hole where a registered anonymous player could modify or
   delete tournaments and games. Public `SELECT` is unchanged.

   > **Note on role scope:** The DB-level `is_staff()` check permits all three staff roles to
   > write to both tables. However, **game writes (add, edit, delete)** are further restricted
   > at the application layer — all `/organizer/games` server actions call
   > `requireOrganizerOrAdmin()`, so referees cannot add, edit, or delete games even though
   > the RLS policy technically allows it. **Tournament status advances and edits** use
   > `requireStaff()` and are therefore accessible to referees as well.

No new Auth/Storage toggles are needed beyond what Plans 1–11 already enable.

### New organizer routes

| Route | Description |
|---|---|
| `/organizer/games` | List, add, inline-edit, and delete games (delete blocked while in use by a tournament). |
| `/organizer/tournaments/new` | Create a draft tournament: name, game, format, mode, team size, optional start time. |
| `/organizer/tournaments/[id]` | Tournament overview — facts, `EditTournamentForm`, `LifecycleControls`, delete. |
| `/organizer/tournaments/[id]/participants/[pid]` | Participant detail — display name, gamertag, birthdate, QR code, edit + remove. |

### Guided status flow

```
draft  →  registration  →  (bracket generation sets running)  →  finished
         "Anmeldung öffnen"                                        "Turnier beenden"
```

- **draft → registration**: click "Anmeldung öffnen" on the overview. Players can now
  register at `/t/<id>/register`.
- **registration → running**: generated from the **Bracket** tab ("Generieren"). This also
  flips status to `running` (unchanged from previous plans).
- **running → finished**: click "Turnier beenden" on the overview.

The "Löschen" button on the overview hard-deletes the tournament and cascades to all
matches, participants, and consents.

### Team size is now per-tournament

`tournament.team_size` is the authoritative value — the game's `team_size` only seeds the
default in the create form. The public registration and board pages read `tournament.team_size`
directly; the `teamLabel()` helper (in `web/src/lib/tournament/lifecycle.ts`) renders it as
`"Solo"` for `1` or `"NvN"` for larger values.

## Multi-Tenancy 2a — org foundation + public org pages

Apply `supabase/migrations/20260629090000_multi_tenant_2a.sql` (applied via db2 MCP; idempotent). It:

1. Creates the `organizations` table (`id`, `name`, `slug`, `created_at`; public SELECT, staff-same-org write).
2. Adds `org_id uuid` FK columns to `profiles` and `tournaments`.
3. Creates `current_org_id()` — a `SECURITY DEFINER` helper that returns the calling user's `org_id` from `profiles`; all org-scoped RLS policies read it.
4. Backfills a default org "Eventpilot" (slug `eventpilot`) and assigns all existing profiles and tournaments to it.
5. Org-scopes the staff write/manage RLS on `tournaments`, `matches`, and `participants` — staff can only write rows belonging to their own org.

No new Auth/Storage toggles are needed beyond what earlier plans already enable.

### What changed

| Area | Change |
|---|---|
| `organizations` table | New — name + URL-safe slug; public readable |
| `profiles.org_id` / `tournaments.org_id` | New FK columns — every row belongs to one org |
| `current_org_id()` | New SECURITY DEFINER SQL function |
| Tournament creation | `org_id` stamped from the staff member's profile |
| Organizer tournament list | Filtered to the caller's org |
| Organizer management pages | 404 for tournaments outside the caller's org |
| `/o/<slug>` | New public per-org page listing that org's tournaments |
| `/` (home) | Replaced global tournament list with a landing + org directory |

### Existing data

All existing tournaments and staff accounts are placed in the **"Eventpilot"** org (slug `eventpilot`). No data is lost.

### Public URLs

| URL | Content |
|---|---|
| `/` | Landing page with org directory (links to `/o/<slug>`) |
| `/o/eventpilot` | Eventpilot org page — lists all Eventpilot tournaments |

### Phase 2b (next)

Self-serve org sign-up + staff invites. This plan deferred to keep scope tight and avoid needing two staff accounts in e2e.

## Tests

- Unit: `cd web && npm test` (Vitest)
- E2E: `cd web && npm run e2e` (Playwright; requires `web/.env.local` + the schema applied/seeded)
