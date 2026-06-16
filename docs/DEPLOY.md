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
