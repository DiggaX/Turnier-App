# Turnier-App (web)

Next.js (App Router) frontend + Supabase backend for managing esports tournaments.

## Dev

```bash
npm install
# create .env.local from .env.example (Supabase URL + anon/publishable key)
npm run dev      # http://localhost:3000
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm test` — Vitest unit tests
- `npm run e2e` — Playwright E2E (needs `.env.local` + the DB schema applied)

See `../docs/DEPLOY.md` for deploy + Supabase setup, and `../docs/superpowers/` for the design spec and plans.
