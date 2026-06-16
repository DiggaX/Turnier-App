# Registration & Consent Implementation Plan (Plan 2/6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A participant can register for an open tournament from a phone (guest via anonymous auth, or via account), complete the media-consent gate (adult checkbox or minor → guardian name + digital signature), and an organizer can sign in and see the participant list with consent status.

**Architecture:** Builds on the Foundation (Next.js 16 in `web/`, hosted Supabase). Participants authenticate via **Supabase Anonymous Auth** (guest) or email (organizers: password + magic link). New tables `participants`, `team_members`, `consents` with RLS keyed on `auth.uid()` (owner) and a `is_staff()` check (organizer/admin/referee). Guardian signatures are captured on a touch canvas and stored in a **private** Supabase Storage bucket. A Next.js middleware refreshes the Supabase session on every request (required for SSR auth in Next 16).

**Tech Stack:** Next.js 16 App Router · @supabase/ssr · Supabase Auth (anonymous + email) · Supabase Storage · Tailwind v4 + shadcn/ui · react-hook-form + zod · Vitest · Playwright.

---

## Prerequisites — manual dashboard steps (hosted Supabase `zqhdbygopftretjtlods`)

These cannot be done via tools (project is on the user's account). The operator does them in the Supabase Dashboard before/at the marked tasks:

1. **Auth → Providers → Email:** ensure "Email" is enabled (password sign-in on by default). For magic links, "Enable email confirmations" / email templates are fine with Supabase's built-in email (rate-limited; OK for dev).
2. **Auth → Sign In / Providers → Anonymous sign-ins: ENABLE.** (Required for guest registration.)
3. **Storage → create a bucket `consent-signatures`, set it PRIVATE** (not public). RLS policies for it are created by the migration in Task 1.
4. **Auth → URL Configuration:** add `http://localhost:3000/**` (dev) and the Vercel preview/prod URLs to "Redirect URLs" (needed for magic-link redirects).

The plan calls out exactly when each is needed.

---

## File Structure (created/modified by this plan)

```
supabase/migrations/
  20260617090000_registration_consent.sql   # enums, participants/team_members/consents, RLS, is_staff(), storage policies, seed open tournament
web/src/
  lib/
    database.types.ts                        # extend with new tables/enums (hand-written)
    consent.ts                               # pure age-gate / consent logic (unit-tested)
    consent.test.ts
    supabase/middleware.ts                   # session refresh helper
  middleware.ts                              # Next.js middleware entry (uses supabase/middleware)
  app/
    (auth)/login/page.tsx                    # organizer login (password + magic link)
    (auth)/login/actions.ts                  # server actions: signInPassword, signInMagicLink, signOut
    auth/confirm/route.ts                    # magic-link / OTP verification route handler
    t/[tournamentId]/register/page.tsx       # public registration entry (server: load tournament)
    t/[tournamentId]/register/registration-form.tsx  # client form (solo/team + identity)
    t/[tournamentId]/register/consent-step.tsx        # client consent (adult checkbox / guardian signature)
    t/[tournamentId]/register/actions.ts     # server actions: registerParticipant, submitConsent
    organizer/tournaments/[id]/participants/page.tsx  # organizer participant list (auth-gated)
  components/
    signature-pad.tsx                        # touch/mouse signature canvas → PNG blob
    ui/...                                    # shadcn components as needed (input, label, checkbox, card, table, badge)
  e2e/
    register-solo.spec.ts                    # guest solo registration + adult consent
    register-minor.spec.ts                   # minor → guardian signature path
    organizer-participants.spec.ts           # organizer sees participant + consent status
docs/DEPLOY.md                               # add the new manual dashboard steps
```

---

## Task 1: Schema — participants, team_members, consents, RLS, storage, seed

**Manual prereq:** dashboard steps 2 (anonymous sign-ins) and 3 (bucket `consent-signatures`) must be done first.

**Files:** Create `supabase/migrations/20260617090000_registration_consent.sql`. Apply via dashboard SQL editor (paste file contents → Run), same as Foundation.

- [ ] **Step 1: Write the migration**

```sql
-- Enums
create type participant_type as enum ('solo', 'team');
create type consent_grantor as enum ('self', 'guardian');

-- staff check helper (organizer/admin/referee have a profiles row with such role)
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin','organizer','referee')
  );
$$;

create table participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  type participant_type not null default 'solo',
  display_name text not null,
  gamertag text,
  birthdate date not null,
  seed int,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  name text not null,
  gamertag text,
  is_captain boolean not null default false,
  created_at timestamptz not null default now()
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants (id) on delete cascade,
  grantor consent_grantor not null,
  grantor_name text not null,
  method text not null check (method in ('checkbox','signature')),
  signature_path text,
  granted_at timestamptz not null default now()
);

alter table participants enable row level security;
alter table team_members enable row level security;
alter table consents enable row level security;

-- participants: owner (the registering auth user) manages own; staff read all
create policy "participants_select_owner_or_staff" on participants
  for select using (user_id = auth.uid() or public.is_staff());
create policy "participants_insert_self" on participants
  for insert with check (user_id = auth.uid());
create policy "participants_update_owner_or_staff" on participants
  for update using (user_id = auth.uid() or public.is_staff());

-- team_members: managed by the owner of the parent participant; staff read
create policy "team_members_select" on team_members
  for select using (
    public.is_staff() or exists (
      select 1 from participants p where p.id = participant_id and p.user_id = auth.uid()
    )
  );
create policy "team_members_write_owner" on team_members
  for all using (
    exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
  );

-- consents: owner inserts/reads own; staff read
create policy "consents_select" on consents
  for select using (
    public.is_staff() or exists (
      select 1 from participants p where p.id = participant_id and p.user_id = auth.uid()
    )
  );
create policy "consents_insert_owner" on consents
  for insert with check (
    exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
  );

-- Storage RLS for the private 'consent-signatures' bucket:
-- a user may upload/read files under a path prefixed with their own uid; staff may read all.
create policy "sig_insert_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'consent-signatures' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "sig_select_own_or_staff" on storage.objects
  for select to authenticated using (
    bucket_id = 'consent-signatures'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff())
  );

-- Seed: one open tournament to register into
insert into tournaments (name, game_id, format, mode, status)
select 'Sommer Cup 2026', g.id, 'single_elim', 'hybrid', 'registration'
from games g where g.name = 'Valorant'
on conflict do nothing;
```

- [ ] **Step 2: Apply it.** Paste the file contents into the Supabase SQL Editor (`https://supabase.com/dashboard/project/zqhdbygopftretjtlods/sql/new`) → Run. Expect "Success".

- [ ] **Step 3: Verify** with a throwaway node check (no secrets) from `web/`:

Run:
```bash
node -e "const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());const {createClient}=require('@supabase/supabase-js');const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);c.from('tournaments').select('name,status').eq('status','registration').then(r=>console.log(JSON.stringify(r.data)||r.error.message));"
```
Expected: prints the seeded tournament `[{"name":"Sommer Cup 2026","status":"registration"}]` (public select policy on tournaments allows anon read).

- [ ] **Step 4: Commit** the migration file:
```bash
git add supabase/migrations/20260617090000_registration_consent.sql
git commit -m "feat: schema for participants, team_members, consents + RLS + storage policies"
```

---

## Task 2: Extend database types

**Files:** Modify `web/src/lib/database.types.ts` — add `participants`, `team_members`, `consents` Row/Insert/Update + new enums (`participant_type`, `consent_grantor`). Hand-written, matching Task 1.

- [ ] **Step 1:** Add the enum unions and three `Tables` entries mirroring the columns in Task 1 (correct nullability: `user_id`, `gamertag`, `seed`, `checked_in_at`, `signature_path` nullable; the rest as defined). Keep the existing `profiles`/`games`/`tournaments` entries.
- [ ] **Step 2: Typecheck.** Run (in `web`): `npm run build`. Expected: passes (types only used where imported).
- [ ] **Step 3: Commit:**
```bash
git add web/src/lib/database.types.ts
git commit -m "feat: extend DB types with participants/team_members/consents"
```

---

## Task 3: Consent logic (pure, TDD) + age-gate

**Files:** Create `web/src/lib/consent.ts`, `web/src/lib/consent.test.ts`.

The pure rules (no I/O), unit-tested first:
- `ageOn(birthdate: string, on: Date): number` — full years.
- `isMinor(birthdate: string, on: Date): boolean` — age < 18.
- `requiredConsentMethod(birthdate, on): "checkbox" | "signature"` — adults → `"checkbox"` (self), minors → `"signature"` (guardian).

- [ ] **Step 1: Write failing tests `web/src/lib/consent.test.ts`:**
```ts
import { describe, it, expect } from "vitest";
import { ageOn, isMinor, requiredConsentMethod } from "@/lib/consent";

const on = new Date("2026-06-16T00:00:00Z");

describe("consent age logic", () => {
  it("computes full years", () => {
    expect(ageOn("2008-06-16", on)).toBe(18);
    expect(ageOn("2008-06-17", on)).toBe(17); // birthday not yet reached
  });
  it("flags minors", () => {
    expect(isMinor("2010-01-01", on)).toBe(true);
    expect(isMinor("2000-01-01", on)).toBe(false);
    expect(isMinor("2008-06-16", on)).toBe(false); // exactly 18
  });
  it("selects consent method", () => {
    expect(requiredConsentMethod("2000-01-01", on)).toBe("checkbox");
    expect(requiredConsentMethod("2012-01-01", on)).toBe("signature");
  });
});
```

- [ ] **Step 2: Run → fail.** `npm test` → fails (module missing).

- [ ] **Step 3: Implement `web/src/lib/consent.ts`:**
```ts
export function ageOn(birthdate: string, on: Date): number {
  const b = new Date(birthdate + "T00:00:00Z");
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const m = on.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function isMinor(birthdate: string, on: Date): boolean {
  return ageOn(birthdate, on) < 18;
}

export function requiredConsentMethod(
  birthdate: string,
  on: Date,
): "checkbox" | "signature" {
  return isMinor(birthdate, on) ? "signature" : "checkbox";
}
```

- [ ] **Step 4: Run → pass.** `npm test` → all green.
- [ ] **Step 5: Commit:**
```bash
git add web/src/lib/consent.ts web/src/lib/consent.test.ts
git commit -m "feat: consent age-gate logic with unit tests"
```

---

## Task 4: Supabase session middleware (Next 16 SSR auth)

**Files:** Create `web/src/lib/supabase/middleware.ts` and `web/src/middleware.ts`.

SSR auth requires refreshing the Supabase session cookie on each request. **Before writing, read the current `@supabase/ssr` + Next 16 middleware guidance** (`web/node_modules/next/dist/docs/` for middleware; the `@supabase/ssr` server-side auth pattern). Implement `updateSession(request)` that creates a server client bound to request/response cookies, calls `supabase.auth.getUser()`, and returns the response with refreshed cookies. `web/src/middleware.ts` exports `middleware` calling `updateSession` and a `config.matcher` excluding static assets.

- [ ] **Step 1:** Implement `updateSession` per the official `@supabase/ssr` Next.js pattern (getAll/setAll on `request.cookies` + `NextResponse`).
- [ ] **Step 2:** Add `web/src/middleware.ts` with the standard `matcher` (`'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'`).
- [ ] **Step 3: Verify** `npm run build` passes and the home page still renders (E2E from Foundation still green: `npm run e2e`).
- [ ] **Step 4: Commit:**
```bash
git add web/src/lib/supabase/middleware.ts web/src/middleware.ts
git commit -m "feat: supabase session refresh middleware for SSR auth"
```

---

## Task 5: Organizer login (email+password + magic link)

**Manual prereq:** dashboard steps 1 and 4 (email provider + redirect URLs). An organizer account must exist — create one in the dashboard (Auth → Users → Add user, email+password) and insert its `profiles` row with `role='organizer'` via SQL editor:
`insert into profiles (id, role, display_name) values ('<user-uuid>', 'organizer', 'Orga') on conflict (id) do update set role='organizer';`

**Files:** `web/src/app/(auth)/login/page.tsx`, `login/actions.ts`, `web/src/app/auth/confirm/route.ts`.

- [ ] **Step 1:** Server actions in `actions.ts`: `signInPassword(formData)` → `supabase.auth.signInWithPassword`; `signInMagicLink(formData)` → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/auth/confirm } })`; `signOut()`. Use the server client from `@/lib/supabase/server`. On password success `redirect("/organizer")`.
- [ ] **Step 2:** `auth/confirm/route.ts` — verify the magic-link `token_hash`+`type` via `supabase.auth.verifyOtp`, then redirect to `/organizer` (follow the current Supabase "Server-Side Auth → Next.js" confirm-route pattern).
- [ ] **Step 3:** `login/page.tsx` — two shadcn forms (password; magic link) posting to the actions. Server Component renders forms; actions are `"use server"`.
- [ ] **Step 4: E2E** `web/e2e/login.spec.ts`: with seeded organizer creds in env (`E2E_ORG_EMAIL`/`E2E_ORG_PASSWORD` in `web/.env.local`), submit the password form and assert redirect to `/organizer`. (Skip the test with `test.skip(!process.env.E2E_ORG_EMAIL)` so CI without creds stays green.)
- [ ] **Step 5: Verify** `npm run build`, `npm run e2e`.
- [ ] **Step 6: Commit:**
```bash
git add web/src/app/(auth) web/src/app/auth web/e2e/login.spec.ts
git commit -m "feat: organizer login (password + magic link)"
```

---

## Task 6: Signature pad component

**Files:** `web/src/components/signature-pad.tsx` (client component).

A touch/mouse canvas that draws strokes and exposes the result as a PNG `Blob` via an imperative ref or `onChange(blob)`. No external lib required (raw canvas pointer events). Include a "Clear" button and an empty-state guard (cannot submit an empty signature).

- [ ] **Step 1:** Implement with `<canvas>` + pointer events (`pointerdown/move/up`), `toBlob("image/png")`, `isEmpty()` tracking, and a Clear button. Accessible label.
- [ ] **Step 2: Unit test** `web/src/components/signature-pad.test.tsx` (jsdom): render, assert canvas + Clear button present, and `isEmpty()` is true initially. (Canvas drawing isn't fully testable in jsdom — keep the unit test to mount/empty-state; the real drawing is covered by the minor E2E in Task 8.)
- [ ] **Step 3: Run** `npm test`, **Commit:**
```bash
git add web/src/components/signature-pad.tsx web/src/components/signature-pad.test.tsx
git commit -m "feat: signature pad canvas component"
```

---

## Task 7: Registration + consent flow (participant)

**Files:** `web/src/app/t/[tournamentId]/register/page.tsx`, `registration-form.tsx`, `consent-step.tsx`, `actions.ts`.

Flow: open `/t/<id>/register` → if no session, sign in anonymously (`supabase.auth.signInAnonymously()`) → form (display name, gamertag, birthdate; if tournament's game `team_size > 1`, also a roster: captain + members) → on submit create `participants` row (+ `team_members`) → consent step: adult → checkbox + typed name; minor → guardian name + signature pad (upload PNG to `consent-signatures/<uid>/<participantId>.png`, then insert `consents` row with `signature_path`). Success screen. Use `react-hook-form` + `zod` for validation.

- [ ] **Step 1:** Install `npm i react-hook-form zod @hookform/resolvers`.
- [ ] **Step 2:** `page.tsx` (Server Component): load the tournament + its game `team_size`; 404 if not `status='registration'`.
- [ ] **Step 3:** `registration-form.tsx` (client): anonymous sign-in on mount if no user; fields with zod schema; solo vs team (team shows roster inputs when `team_size > 1`). Calls `registerParticipant` server action.
- [ ] **Step 4:** `actions.ts` `registerParticipant(input)`: validate with zod (server-side too), insert `participants` (user_id = auth.uid(), type, display_name, gamertag, birthdate) and `team_members` rows; return `participantId`.
- [ ] **Step 5:** `consent-step.tsx` (client): compute `requiredConsentMethod(birthdate, new Date())`. Adult → checkbox + name. Minor → guardian name + `<SignaturePad>`; on submit upload PNG via supabase storage (`supabase.storage.from('consent-signatures').upload(`${uid}/${participantId}.png`, blob)`), then call `submitConsent`.
- [ ] **Step 6:** `actions.ts` `submitConsent({participantId, grantor, grantorName, method, signaturePath})`: insert `consents` row (RLS enforces ownership). Block (zod) signature method without a `signaturePath`.
- [ ] **Step 7: E2E** `web/e2e/register-solo.spec.ts` (adult, checkbox) and `register-minor.spec.ts` (minor → draws on signature pad via mouse events → asserts success + that a `consents` row exists by reloading a confirmation that reads back consent state). Use a unique gamertag per run (index/timestamp via test title) to avoid the `unique(tournament_id, user_id)` clash across runs — each run is a fresh anonymous user, so this is naturally satisfied.
- [ ] **Step 8: Verify** `npm run build`, `npm test`, `npm run e2e`.
- [ ] **Step 9: Commit:**
```bash
git add web/src/app/t web/package.json web/package-lock.json web/e2e/register-solo.spec.ts web/e2e/register-minor.spec.ts
git commit -m "feat: participant registration + media consent flow (anonymous auth, signature upload)"
```

---

## Task 8: Organizer participant list

**Files:** `web/src/app/organizer/tournaments/[id]/participants/page.tsx`.

Auth-gated Server Component: if no staff session → redirect `/login`. Lists `participants` for the tournament (RLS `is_staff()` returns all), joined with their latest `consents` row, showing a green/red consent badge and check-in status. Uses shadcn `table` + `badge`.

- [ ] **Step 1:** Implement the page: `createClient()` (server), `getUser()`, guard staff (query `profiles.role`); query participants + consents; render table with consent badge (green = has consent row, red = none).
- [ ] **Step 2: E2E** `web/e2e/organizer-participants.spec.ts` (skipped unless `E2E_ORG_EMAIL` set): log in as organizer, open the participants page for the seeded tournament, assert a previously-registered participant + consent badge render.
- [ ] **Step 3: Verify** `npm run build`, `npm run e2e`.
- [ ] **Step 4: Commit:**
```bash
git add web/src/app/organizer web/e2e/organizer-participants.spec.ts
git commit -m "feat: organizer participant list with consent status"
```

---

## Task 9: Docs + deploy notes

- [ ] **Step 1:** Append the new manual dashboard steps (anonymous sign-ins, `consent-signatures` bucket, redirect URLs, organizer account) to `docs/DEPLOY.md`.
- [ ] **Step 2: Commit:**
```bash
git add docs/DEPLOY.md
git commit -m "docs: registration/consent setup steps"
```

---

## Self-Review (run after writing all tasks)
- **Spec coverage:** registration (guest/account, mobile), consent (adult checkbox; minor guardian signature; hard gate via consent presence), organizer visibility (participant list + status) — all from spec §6 are covered. Check-in (§7) is intentionally Plan 3.
- **Placeholder scan:** SQL/types/consent-logic/middleware are concrete; the auth/registration UI tasks cite the canonical Supabase+Next 16 patterns and direct the implementer to bundled/official docs for exact code (Next 16 / @supabase/ssr APIs evolve — verify rather than hardcode stale calls).
- **Type consistency:** `participants.user_id`, `is_staff()`, `requiredConsentMethod` names are reused consistently across tasks.

## Done = all true
- Migration applied; seeded "Sommer Cup 2026" is registration-open.
- `npm test` green (consent logic + signature mount).
- A guest can register on mobile and complete consent (adult + minor paths) — E2E green.
- Organizer signs in and sees the participant list with consent status — E2E green (with creds).
- `npm run build` succeeds.

## Post-review fixes & deferrals (final security review)
- **C1 (fixed, `20260617120000_tighten_write_policies.sql`):** anonymous auth grants role `authenticated` to any visitor; the Foundation's `to authenticated using(true)` write policies on `games`/`tournaments` are tightened to `is_staff()`-only so anonymous registrants cannot modify tournaments/games. Public SELECT stays open. **Must be applied to the live DB.**
- **I2 (deferred to Plan 3 — check-in):** the consent gate is UI-level; the DB does not yet guarantee a minor has a guardian signature, nor bind `consents.method`/`grantor` to `birthdate`. No harmful action is reachable today (RLS holds), but DB/server enforcement (a `SECURITY DEFINER` RPC that inserts participant+consent atomically with minor→signature validation) MUST land before check-in or any media-publishing feature treats a `consents` row as authoritative.
- **Follow-ups (M3–M6):** staff DELETE policy for spam registrations; abuse controls for unbounded anonymous users + orphaned signatures (prune job / CAPTCHA); friendly handling of `23505` duplicate-registration; map raw DB error messages to user-facing strings.
