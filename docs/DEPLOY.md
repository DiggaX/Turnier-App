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
