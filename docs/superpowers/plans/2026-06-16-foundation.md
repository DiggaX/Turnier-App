# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable Next.js + Supabase skeleton with end-to-end data wiring, a test harness, and base schema — the foundation all later feature plans build on.

**Architecture:** Next.js (App Router, TypeScript) lives in `web/`. Supabase (Postgres + RLS, Auth, Realtime, Storage) is managed via the Supabase CLI in `supabase/` at the repo root, run locally with Docker. A server component reads from Supabase to prove the wiring. Vitest covers pure logic, Playwright covers pages.

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · shadcn/ui · @supabase/ssr + supabase-js · Supabase CLI · Vitest · Playwright · npm · Deploy: Vercel (Root Directory `web`).

---

## Prerequisites (verify before Task 1)

- **Node** ≥ 20 (installed: v24.14). Check: `node -v`
- **Docker Desktop** running (required for local Supabase). Check: `docker info`
  - *Fallback if no Docker:* skip `supabase start`; instead `npx supabase link --project-ref <ref>` and `npx supabase db push` against a hosted dev project, and put the hosted URL/anon key in `web/.env.local`. Local Docker is strongly preferred for development.
- Working directory for all `npm` commands: `C:\Users\Rene\Turnierapp\web`
- Working directory for all `supabase` commands: `C:\Users\Rene\Turnierapp`

---

## File Structure (created by this plan)

```
Turnierapp/
├─ supabase/
│  ├─ config.toml                         # supabase init
│  ├─ migrations/
│  │  └─ <ts>_base_schema.sql             # enums + profiles/games/tournaments + RLS
│  └─ seed.sql                            # seed games (Valorant, FIFA)
├─ web/
│  ├─ src/
│  │  ├─ app/
│  │  │  ├─ layout.tsx                    # root layout (from scaffold)
│  │  │  └─ page.tsx                      # home: lists games from Supabase
│  │  ├─ components/ui/button.tsx         # shadcn Button
│  │  └─ lib/
│  │     ├─ utils.ts                      # shadcn cn()
│  │     ├─ utils.test.ts                 # Vitest unit test for cn()
│  │     ├─ database.types.ts             # supabase gen types
│  │     └─ supabase/
│  │        ├─ client.ts                  # browser client
│  │        └─ server.ts                  # server client (cookies)
│  ├─ e2e/
│  │  └─ home.spec.ts                     # Playwright: home renders seeded game
│  ├─ vitest.config.ts
│  ├─ vitest.setup.ts
│  ├─ playwright.config.ts
│  ├─ .env.local                          # NOT committed (gitignored)
│  └─ .env.example                        # committed template
└─ docs/DEPLOY.md                         # Vercel + Supabase deploy notes
```

---

## Task 0: Clean stray claude-flow install at repo root

The earlier `npm install claude-flow` left an unused `node_modules/`, `package.json`, `package-lock.json` at the repo root. The MCP server uses `npx` (see `.mcp.json`), so the local install is unreferenced. Remove it so the root stays clean (the real app lives in `web/`).

- [ ] **Step 1: Confirm the stray package.json is the claude-flow one**

Run (in `C:\Users\Rene\Turnierapp`):
```powershell
Get-Content package.json | Select-String '"name"'
```
Expected: a line containing `"claude-flow"` (or similar). If it shows anything app-related, STOP and ask — do not delete.

- [ ] **Step 2: Remove the stray install**

Run (in `C:\Users\Rene\Turnierapp`):
```powershell
Remove-Item -Recurse -Force node_modules, package.json, package-lock.json
```

- [ ] **Step 3: Verify clean**

Run: `Test-Path package.json`
Expected: `False`

(No commit — these paths are gitignored / were never tracked.)

---

## Task 1: Scaffold Next.js app in `web/`

**Files:**
- Create: `web/` (entire Next.js scaffold)

- [ ] **Step 1: Scaffold (non-interactive)**

Run (in `C:\Users\Rene\Turnierapp`):
```bash
npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```
Expected: `web/` created with `package.json`, `src/app/`, Tailwind configured.

- [ ] **Step 2: Start dev server to verify boot**

Run (in `web`): `npm run dev`
Expected: `Ready` on `http://localhost:3000`. Open it → default Next.js page renders. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

Run (in `C:\Users\Rene\Turnierapp`):
```bash
git add web
git commit -m "feat: scaffold Next.js app in web/"
```

---

## Task 2: Vitest harness + first unit test

**Files:**
- Create: `web/vitest.config.ts`, `web/vitest.setup.ts`, `web/src/lib/utils.test.ts`
- Modify: `web/package.json` (scripts), `web/src/lib/utils.ts` (created by shadcn in Task 4 — for now create a minimal `cn`)

- [ ] **Step 1: Install dev deps**

Run (in `web`):
```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Create `web/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Run (in `web`): `npm i clsx tailwind-merge`

- [ ] **Step 3: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 4: Create `web/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Add scripts to `web/package.json`**

In the `"scripts"` object add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write the failing test `web/src/lib/utils.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("p-2", "p-4")).toBe("p-4"); // tailwind-merge dedupes
  });
  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });
});
```

- [ ] **Step 7: Run test**

Run (in `web`): `npm test`
Expected: 2 passing tests.

- [ ] **Step 8: Commit**

```bash
git add web/vitest.config.ts web/vitest.setup.ts web/src/lib/utils.ts web/src/lib/utils.test.ts web/package.json web/package-lock.json
git commit -m "test: add Vitest harness with cn() unit test"
```

---

## Task 3: Playwright harness + home E2E

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/home.spec.ts`
- Modify: `web/package.json` (scripts), `web/.gitignore` (Playwright artifacts)

- [ ] **Step 1: Install + browsers**

Run (in `web`):
```bash
npm i -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Write the failing test `web/e2e/home.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("home page renders heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turnier/i })).toBeVisible();
});
```

- [ ] **Step 4: Replace `web/src/app/page.tsx` with a minimal heading**

```tsx
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Turnier-App</h1>
    </main>
  );
}
```

- [ ] **Step 5: Add script to `web/package.json`**

```json
"e2e": "playwright test"
```

- [ ] **Step 6: Append Playwright artifacts to `web/.gitignore`**

```
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 7: Run E2E**

Run (in `web`): `npm run e2e`
Expected: 1 passing test (Playwright auto-starts dev server).

- [ ] **Step 8: Commit**

```bash
git add web/playwright.config.ts web/e2e/home.spec.ts web/src/app/page.tsx web/package.json web/package-lock.json web/.gitignore
git commit -m "test: add Playwright E2E with home page test"
```

---

## Task 4: shadcn/ui init + Button

**Files:**
- Create: `web/src/components/ui/button.tsx`, `web/components.json`
- Modify: `web/src/app/globals.css`, `web/src/app/page.tsx`

- [ ] **Step 1: Init shadcn (defaults)**

Run (in `web`): `npx shadcn@latest init -d`
Expected: `components.json` created, `globals.css` updated with CSS variables, `cn` util confirmed at `@/lib/utils`.

- [ ] **Step 2: Add Button**

Run (in `web`): `npx shadcn@latest add button`
Expected: `src/components/ui/button.tsx` created.

- [ ] **Step 3: Use Button in `web/src/app/page.tsx`**

```tsx
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Turnier-App</h1>
      <Button>Los geht's</Button>
    </main>
  );
}
```

- [ ] **Step 4: Verify E2E still green**

Run (in `web`): `npm run e2e`
Expected: home test still passes.

- [ ] **Step 5: Commit**

```bash
git add web/components.json web/src/components web/src/app/globals.css web/src/app/page.tsx web/package.json web/package-lock.json
git commit -m "feat: init shadcn/ui and add Button"
```

---

## Task 5: Supabase init + base schema migration

**Files:**
- Create: `supabase/config.toml` (init), `supabase/migrations/<ts>_base_schema.sql`, `supabase/seed.sql`

- [ ] **Step 1: Init Supabase**

Run (in `C:\Users\Rene\Turnierapp`): `npx supabase init`
Expected: `supabase/config.toml` created. (Decline the VS Code/Deno prompt unless wanted.)

- [ ] **Step 2: Start local stack (Docker)**

Run (in repo root): `npx supabase start`
Expected: prints `API URL: http://127.0.0.1:54321`, `anon key`, `service_role key`, `Studio URL`. Keep these for Task 6. (If this fails, see Prerequisites fallback.)

- [ ] **Step 3: Create migration file**

Run (in repo root): `npx supabase migration new base_schema`
Expected: empty file at `supabase/migrations/<timestamp>_base_schema.sql`.

- [ ] **Step 4: Fill the migration**

Put this in the new migration file:
```sql
-- Enums
create type user_role as enum ('admin', 'organizer', 'referee');
create type tournament_format as enum ('single_elim', 'round_robin', 'double_elim', 'swiss', 'groups_playoffs');
create type tournament_mode as enum ('lan', 'online', 'hybrid');
create type tournament_status as enum ('draft', 'registration', 'running', 'finished');

-- profiles: one row per auth user (organizer/admin/referee)
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'organizer',
  display_name text,
  created_at timestamptz not null default now()
);

-- games: catalog of playable titles
create table games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_size int not null default 1 check (team_size >= 1),
  created_at timestamptz not null default now()
);

-- tournaments
create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  game_id uuid not null references games (id),
  format tournament_format not null,
  mode tournament_mode not null default 'hybrid',
  status tournament_status not null default 'draft',
  starts_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;
alter table games enable row level security;
alter table tournaments enable row level security;

-- profiles: a user sees and edits only their own profile
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- games: public read; only authenticated users may write
create policy "games_select_public" on games
  for select using (true);
create policy "games_write_authenticated" on games
  for all to authenticated using (true) with check (true);

-- tournaments: public read; only authenticated users may write
create policy "tournaments_select_public" on tournaments
  for select using (true);
create policy "tournaments_write_authenticated" on tournaments
  for all to authenticated using (true) with check (true);
```

> Note: `games`/`tournaments` write policies are permissive for the foundation (any authenticated user). Role-scoped policies (organizer/admin only) are tightened in the Registration & Auth plan.

- [ ] **Step 5: Create `supabase/seed.sql`**

```sql
insert into games (name, team_size) values
  ('Valorant', 5),
  ('FIFA', 1);
```

- [ ] **Step 6: Apply migration + seed locally**

Run (in repo root): `npx supabase db reset`
Expected: migration applies, seed runs, no errors. Verify in Studio (`http://127.0.0.1:54323`) → `games` has Valorant + FIFA.

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/migrations supabase/seed.sql
git commit -m "feat: supabase base schema (profiles, games, tournaments) with RLS"
```

---

## Task 6: Supabase clients + generated types + env

**Files:**
- Create: `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/server.ts`, `web/src/lib/database.types.ts`, `web/.env.local` (gitignored), `web/.env.example`

- [ ] **Step 1: Install deps**

Run (in `web`): `npm i @supabase/supabase-js @supabase/ssr`

- [ ] **Step 2: Create `web/.env.local`** (use values from `supabase start` in Task 5)

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
```

- [ ] **Step 3: Create `web/.env.example`** (committed template)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Generate DB types**

Run (in repo root):
```bash
npx supabase gen types typescript --local > web/src/lib/database.types.ts
```
Expected: a `Database` type exported, including `games` row types.

- [ ] **Step 5: Create `web/src/lib/supabase/client.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 6: Create `web/src/lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — safe to ignore when middleware refreshes sessions
          }
        },
      },
    },
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/supabase web/src/lib/database.types.ts web/.env.example web/package.json web/package-lock.json
git commit -m "feat: add Supabase browser/server clients and generated types"
```

---

## Task 7: End-to-end wiring — home lists games from Supabase

**Files:**
- Modify: `web/src/app/page.tsx`, `web/e2e/home.spec.ts`

- [ ] **Step 1: Update the failing E2E `web/e2e/home.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("home page renders heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turnier/i })).toBeVisible();
});

test("home page lists seeded games from Supabase", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Valorant")).toBeVisible();
  await expect(page.getByText("FIFA")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E to verify the new test fails**

Run (in `web`): `npm run e2e`
Expected: "lists seeded games" FAILS (games not rendered yet). (Ensure `npx supabase start` is running.)

- [ ] **Step 3: Implement the server component `web/src/app/page.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: games } = await supabase
    .from("games")
    .select("id, name, team_size")
    .order("name");

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Turnier-App</h1>
      <ul className="space-y-1">
        {games?.map((g) => (
          <li key={g.id}>
            {g.name} <span className="text-muted-foreground">({g.team_size}er)</span>
          </li>
        ))}
      </ul>
      <Button>Los geht's</Button>
    </main>
  );
}
```

- [ ] **Step 4: Run E2E to verify pass**

Run (in `web`): `npm run e2e`
Expected: both tests pass (Valorant + FIFA visible).

- [ ] **Step 5: Run unit tests + lint + build (full green gate)**

Run (in `web`):
```bash
npm test
npm run lint
npm run build
```
Expected: all pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/page.tsx web/e2e/home.spec.ts
git commit -m "feat: home lists games from Supabase (end-to-end wiring)"
```

---

## Task 8: Deploy notes (Vercel + Supabase)

**Files:**
- Create: `docs/DEPLOY.md`

- [ ] **Step 1: Write `docs/DEPLOY.md`**

```markdown
# Deploy

## Vercel
- Import the GitHub repo `DiggaX/Turnier-App` in Vercel.
- **Root Directory:** `web`
- Framework preset: Next.js (auto).
- Environment variables (Production + Preview):
  - `NEXT_PUBLIC_SUPABASE_URL` = hosted Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = hosted Supabase anon/publishable key

## Supabase (hosted)
- Create a project at supabase.com (or reuse the connected one).
- Link + push migrations from repo root:
  ```bash
  npx supabase link --project-ref <ref>
  npx supabase db push
  ```
- Seed games once (Studio SQL editor or `supabase db push` with seed).

## Local dev
- `npx supabase start` (Docker) → copy URL + anon key into `web/.env.local`.
- `cd web && npm run dev`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs: add Vercel + Supabase deploy notes"
```

- [ ] **Step 3 (optional): Push the foundation branch**

```bash
git push
```

---

## Self-Review (completed)

- **Spec coverage:** Foundation implements the stack/architecture (§3), base data model subset (§5: profiles, games, tournaments), RLS scaffolding (§12), and deploy target (§12). Registration/consent, check-in, generator, results, live-board are explicitly deferred to plans 2–6.
- **Placeholders:** none — every code/command step is concrete. The one `<ref>`/`<anon key>` tokens are runtime secrets the operator pastes, not plan gaps.
- **Type consistency:** `cn` (Task 2/4), `createClient` (server + browser, Task 6) and the `games` columns `id, name, team_size` (Task 5 schema → Task 7 query) line up.

## Done = all true
- `cd web && npm test` green
- `cd web && npm run e2e` green (with `supabase start` running)
- `cd web && npm run build` succeeds
- Home page renders Valorant + FIFA from local Supabase
- All work committed
