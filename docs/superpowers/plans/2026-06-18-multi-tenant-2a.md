# Multi-Tenancy Phase 2a Implementation Plan (Org-Fundament + Isolation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The app becomes multi-tenant: every Firma is an `organization`, each staff account belongs to exactly one org, each tournament belongs to one org, and RLS strictly isolates management per org. Each org gets a public page `/o/<slug>`; the home becomes a landing + org directory. Existing data moves into a default org "Eventpilot". See `docs/superpowers/specs/2026-06-18-multi-tenant-2a-design.md`.

**Architecture:** Org tenant key via `profiles.org_id` + `tournaments.org_id` + a `current_org_id()` SECURITY DEFINER helper that all org-scoped RLS reads. Staff write/manage policies become `is_staff() AND <belongs to current_org_id()>`; public SELECT stays open; player owner-policies + the (already anon-scoped) board read stay. Organizer reads also filter by org explicitly. Public pages use the existing `createPublicClient` (anon). **I apply the migration via the db2 MCP and verify isolation with simulated-role queries** — no manual step for the user.

**Tech Stack:** Next.js 16 (App Router, `web/`) · Supabase (Postgres, RLS) · Vitest · Playwright.

> Current participants RLS (post the 2026-06-28 hotfix): `participants_select_public_board` is `to anon`; `participants_select_owner_or_staff` + `participants_update_owner_or_staff` use `(user_id = auth.uid() OR is_staff())`; `participants_delete_staff` uses `is_staff()`. This plan org-scopes the `is_staff()` parts.

---

## Prerequisites — manual dashboard steps
**None.** I apply the Task 1 migration via db2.

---

## Task 1: Migration — org schema + backfill + RLS isolation

**Files:** Create `supabase/migrations/20260629090000_multi_tenant_2a.sql`.

- [ ] **Step 1: Write the migration.**

```sql
-- Phase 2a: multi-tenancy foundation + management isolation.

-- 1. organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
alter table organizations enable row level security;
create policy "orgs_select_public" on organizations for select using (true);

-- 2. tenant key columns
alter table profiles    add column if not exists org_id uuid references organizations (id) on delete set null;
alter table tournaments add column if not exists org_id uuid references organizations (id) on delete cascade;

-- 3. current_org_id(): the caller's org (SECURITY DEFINER bypasses profiles RLS).
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- 4. backfill default org + assign all existing rows
with org as (
  insert into organizations (name, slug) values ('Eventpilot', 'eventpilot')
  on conflict (slug) do update set name = excluded.name
  returning id
)
update profiles set org_id = (select id from org) where org_id is null;
update tournaments set org_id = (select id from organizations where slug = 'eventpilot') where org_id is null;
alter table tournaments alter column org_id set not null;

-- 5. organizations write: staff of that org only (now that org_id is backfilled)
drop policy if exists "orgs_write_staff_same_org" on organizations;
create policy "orgs_write_staff_same_org" on organizations for all
  using (public.is_staff() and id = public.current_org_id())
  with check (public.is_staff() and id = public.current_org_id());

-- 6. org-scope the staff write/manage policies
drop policy if exists "tournaments_write_staff" on tournaments;
create policy "tournaments_write_staff" on tournaments for all
  using (public.is_staff() and org_id = public.current_org_id())
  with check (public.is_staff() and org_id = public.current_org_id());

drop policy if exists "matches_write_staff" on matches;
create policy "matches_write_staff" on matches for all
  using (public.is_staff() and exists (
    select 1 from tournaments t where t.id = matches.tournament_id and t.org_id = public.current_org_id()))
  with check (public.is_staff() and exists (
    select 1 from tournaments t where t.id = matches.tournament_id and t.org_id = public.current_org_id()));

-- participants: org-scope the staff parts; keep the owner (player) + anon-board parts.
drop policy if exists "participants_select_owner_or_staff" on participants;
create policy "participants_select_owner_or_staff" on participants for select
  using (user_id = auth.uid() or (public.is_staff() and exists (
    select 1 from tournaments t where t.id = participants.tournament_id and t.org_id = public.current_org_id())));

drop policy if exists "participants_update_owner_or_staff" on participants;
create policy "participants_update_owner_or_staff" on participants for update
  using (user_id = auth.uid() or (public.is_staff() and exists (
    select 1 from tournaments t where t.id = participants.tournament_id and t.org_id = public.current_org_id())));

drop policy if exists "participants_delete_staff" on participants;
create policy "participants_delete_staff" on participants for delete
  using (public.is_staff() and exists (
    select 1 from tournaments t where t.id = participants.tournament_id and t.org_id = public.current_org_id()));

-- games stay GLOBAL (shared catalog) — unchanged.
```

- [ ] **Step 2: Apply via db2 + verify isolation.** Apply the migration (db2 `apply_migration`). Then verify with simulated-role queries (db2 `execute_sql`): create a second test org + a second-org staff profile, and confirm that staff CANNOT update a first-org tournament (RLS denies). Record the verification result. At minimum confirm: `select count(*) from tournaments` for an Eventpilot-staff JWT returns only Eventpilot tournaments via an org-filtered query, and a cross-org `update tournaments set name=... where <other org row>` affects 0 rows under the other org's JWT.

- [ ] **Step 3: Commit the migration file.**

```bash
git add supabase/migrations/20260629090000_multi_tenant_2a.sql
git commit -m "feat: organizations + org_id + current_org_id() + org-scoped RLS isolation"
```

## Task 2: Types

**Files:** Modify `web/src/lib/database.types.ts`.

- [ ] **Step 1:** Add an `organizations` table type (Row/Insert/Update: id, name, slug, created_at; Relationships []). Add `org_id: string` to `profiles` Row (`org_id?: string | null` Insert/Update) and `org_id: string` to `tournaments` Row (`org_id?: string` Insert/Update).
- [ ] **Step 2: Build.** `cd web && npm run build` → PASS.
- [ ] **Step 3: Commit.** `git add web/src/lib/database.types.ts && git commit -m "feat: types for organizations + org_id"`

## Task 3: Slug helper (TDD)

**Files:** Create `web/src/lib/org/slug.ts` + `web/src/lib/org/slug.test.ts`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { orgSlug } from "./slug";

describe("orgSlug", () => {
  it("lowercases, replaces non-alphanumerics with single hyphens, trims", () => {
    expect(orgSlug("Eventpilot")).toBe("eventpilot");
    expect(orgSlug("Acme  E-Sports!! GmbH")).toBe("acme-e-sports-gmbh");
    expect(orgSlug("  --Hallo--  ")).toBe("hallo");
  });
  it("maps umlauts and returns empty string for no alphanumerics", () => {
    expect(orgSlug("Münchner Löwen")).toBe("muenchner-loewen");
    expect(orgSlug("!!!")).toBe("");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && npx vitest run src/lib/org/slug.test.ts`

- [ ] **Step 3: Implement.**

```ts
/** URL-safe org slug: lowercase, umlauts transliterated, non-alphanumerics → single hyphens, trimmed. */
export function orgSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `git add web/src/lib/org/ && git commit -m "feat: org slug helper with tests"`

## Task 4: requireStaff returns orgId · createTournament sets org_id · organizer list filters by org

**Files:**
- Modify: `web/src/lib/auth/staff.ts`
- Modify: `web/src/app/organizer/tournaments/actions.ts`
- Modify: `web/src/app/organizer/page.tsx`

- [ ] **Step 1: Extend `requireStaff`** to also return the caller's `orgId`. Change its profile select to `"role, org_id"` and return `{ supabase, orgId: profile.org_id as string | null }` on success.

- [ ] **Step 2: `createTournament` sets `org_id`.** Replace the redundant second `getUser()` for `created_by` with the guard's data and set `org_id`:
  - After `const { supabase, orgId } = guard;` (destructure orgId), if `!orgId` return `{ error: "Kein Org-Kontext — dein Account ist keiner Organisation zugeordnet." }`.
  - In the insert row add `org_id: orgId` (and keep `created_by` via `(await supabase.auth.getUser()).data.user?.id`).

- [ ] **Step 3: Organizer landing filters by org.** In `organizer/page.tsx`, after the staff check, read the caller's `org_id` (`select role, org_id from profiles where id = user.id`) and filter the tournaments query `.eq("org_id", orgId)` (when orgId is null, render the empty state). RLS keeps writes safe; this scopes the visible list.

- [ ] **Step 4: Build + commit.** `cd web && npm run build`; commit the three files: `feat: org-scope tournament creation + organizer list`.

## Task 5: Org-guard the organizer management pages

**Files:**
- Create: `web/src/lib/auth/org-tournament.ts`
- Modify each organizer page that loads a single tournament by id: `[id]/page.tsx`, `[id]/bracket/page.tsx`, `[id]/matches/page.tsx`, `[id]/participants/page.tsx`, `[id]/participants/[pid]/page.tsx`, `[id]/checkin/page.tsx`, `[id]/station/page.tsx`.

- [ ] **Step 1: Helper.** `web/src/lib/auth/org-tournament.ts`:

```ts
import "server-only";
import { notFound } from "next/navigation";
import type { createClient } from "@/lib/supabase/server";

/**
 * Load a tournament only if it belongs to the caller's org; otherwise notFound().
 * `tournaments` is public-SELECT, so without this a staff member could view (not
 * write) another org's management pages by guessing the id. Pass any extra select
 * columns via `columns` (must include `org_id`).
 */
export async function requireOrgTournament(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  orgId: string | null,
  columns: string,
) {
  const { data } = await supabase
    .from("tournaments")
    .select(columns)
    .eq("id", tournamentId)
    .maybeSingle<{ org_id: string } & Record<string, unknown>>();
  if (!data || orgId == null || data.org_id !== orgId) notFound();
  return data;
}
```

- [ ] **Step 2: Apply to each page.** Each listed page already does the staff-gate (`profiles` role check) + loads the tournament. Change the profile select to include `org_id`, and replace the direct tournament load with `requireOrgTournament(supabase, id, profile.org_id, "<the existing select columns, ensure org_id is included>")`. Keep everything else. This makes every organizer management surface 404 for tournaments outside the caller's org.

- [ ] **Step 3: Build + commit.** `cd web && npm run build`; commit: `feat: org-guard organizer tournament pages`.

## Task 6: Public org page `/o/[slug]`

**Files:** Create `web/src/app/o/[slug]/page.tsx`.

- [ ] **Step 1:** A public server page (use `createPublicClient` from `@/lib/supabase/public`). Load the org by slug (`select id, name from organizations where slug = <slug>`, `notFound()` if missing). List that org's tournaments — reuse the home's card layout (`TournamentCard`, sort by status) but query `.eq("org_id", org.id)`, selecting `id, name, format, mode, status, starts_at, team_size, games(name), participants(id)` and computing the count from `participants?.length` and team label via `teamLabel(team_size)`. Show the org name as the heading. (Lift the shared card-mapping from `page.tsx` if convenient, or duplicate the small map.)
- [ ] **Step 2: Build + commit.** Commit: `feat(design): public per-org tournament page /o/[slug]`.

## Task 7: Home → landing + org directory

**Files:** Modify `web/src/app/page.tsx`.

- [ ] **Step 1:** Replace the global tournament list with a landing: a short hero/pitch (keep the existing hero styling) + a list of organizations (`select name, slug from organizations order by name`, via `createPublicClient`), each linking to `/o/<slug>`. If there is exactly one org, it's fine to also link prominently to it. Keep `SiteNav`. Remove the now-unused tournament-list code (and any imports it used like `TournamentCard`/`STATUS_RANK` if no longer referenced).
- [ ] **Step 2: Build + commit.** Commit: `feat(design): home becomes landing + org directory`.

## Task 8: e2e + docs

**Files:** Create `web/e2e/multi-tenant.spec.ts`; modify `docs/DEPLOY.md`.

- [ ] **Step 1: e2e.** Public-only (no second org account needed): assert `/o/eventpilot` renders and lists "Sommer Cup 2026"; assert the home (`/`) shows the org directory with an "Eventpilot" link that navigates to `/o/eventpilot`. (Org-management isolation is verified via db2 in Task 1, not e2e — that needs two staff accounts, which 2b's signup will enable.)
- [ ] **Step 2: docs.** Append a "Multi-Tenancy 2a" section to `docs/DEPLOY.md`: the `20260629090000_multi_tenant_2a.sql` migration (applied via db2); orgs + `org_id` + `current_org_id()`; management isolated per org; `/o/<slug>` public pages; home = landing + org directory; existing data in the "Eventpilot" org. Note Phase 2b (self-serve signup + invites) is next.
- [ ] **Step 3: Verify + commit.** `cd web && npm run build && npm test`; commit: `feat: multi-tenant 2a e2e + docs`.

---

## Self-Review
- **Spec coverage:** orgs + org_id + current_org_id() (Task 1), backfill Eventpilot (Task 1), RLS isolation incl. transitive participants/matches (Task 1), org-scoped create + list (Task 4), org-guard management pages (Task 5), `/o/<slug>` (Task 6), home landing (Task 7), slug helper (Task 3), e2e+docs (Task 8). Games stay global (Task 1 leaves them). 2b deferred.
- **Security:** writes are RLS-isolated per org (tournaments/matches/participants/organizations); management pages 404 cross-org (Task 5); the prior hotfix already closed the participant PII read leak; players' owner-policies + anon board read untouched; `current_org_id()` is SECURITY DEFINER and only reads the caller's own org.
- **Type consistency:** `current_org_id()` (SQL), `requireStaff` now returns `orgId`, `requireOrgTournament` (org-tournament.ts), `orgSlug` (slug.ts), `organizations`/`org_id` types — consistent across tasks.

## Done = all true
orgs + org_id + current_org_id() migrated (via db2, isolation verified); existing data in "Eventpilot"; staff management strictly org-isolated (writes RLS-blocked + management pages 404 cross-org); games global; organizer sees/creates only own-org tournaments; `/o/<slug>` lists an org's tournaments; home is a landing + org directory; slug helper unit-tested; build + unit green.
