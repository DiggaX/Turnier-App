# Multi-Tenancy Phase 2b Implementation Plan (Signup + Invites + Members)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Self-serve onboarding: a visitor signs up and creates their org (becoming its admin), the admin invites members via single-use role-scoped links, and the admin manages members (role change, remove) + invites. Completes Module 2. See `docs/superpowers/specs/2026-06-18-multi-tenant-2b-design.md`.

**Architecture:** Privileged profile/org creation runs through SECURITY DEFINER RPCs (profiles have no INSERT policy + no auth trigger): `bootstrap_org`, `accept_invite`, `peek_invite`, `set_member_role`, `remove_member`, plus an `is_admin()` helper and an `org_invites` table (admin-of-org RLS) and a `profiles_select_same_org` read policy. Auth uses Supabase email/password (email-confirm OFF for MVP → immediate session). Signup + members pages mirror the existing `(auth)/login` + organizer patterns; server actions wrap the RPCs with `requireStaff`/admin guards. **I apply the migration via db2 + verify the guards** with simulated-role queries.

**Tech Stack:** Next.js 16 (App Router, `web/`) · Supabase (Postgres, RLS, Auth) · Vitest · Playwright.

---

## Prerequisites — manual steps
**None** (I apply the migration via db2). One Supabase Auth setting is assumed: **email confirmations OFF** (Dashboard → Auth → Providers → Email → "Confirm email" disabled) so `signUp` returns a session immediately. If it's ON, signup still creates the account but the org bootstrap must wait for confirmation — out of scope for 2b; note it in DEPLOY docs.

---

## Task 1: Migration — org_invites + is_admin() + RPCs + profiles policy

**Files:** Create `supabase/migrations/20260701090000_multi_tenant_2b.sql`.

- [ ] **Step 1: Write the migration.**

```sql
-- Phase 2b: self-serve org signup + invites + member management.

create table if not exists org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null unique,
  role text not null check (role in ('organizer','referee')),
  created_by uuid references profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table org_invites enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Admin of the org manages its invites. No public select (code is the secret;
-- joining goes through accept_invite/peek_invite, not direct reads).
create policy "org_invites_admin_same_org" on org_invites for all
  using (org_id = public.current_org_id() and public.is_admin())
  with check (org_id = public.current_org_id() and public.is_admin());

-- Staff may read the members of their own org (for the members list).
create policy "profiles_select_same_org" on profiles for select
  using (org_id is not null and org_id = public.current_org_id());

-- bootstrap_org: an authenticated user WITHOUT a profile creates their org + admin profile.
create or replace function public.bootstrap_org(p_name text, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_slug text; v_org uuid; n int := 1;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid) then raise exception 'bereits einer Organisation zugeordnet'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Firmenname erforderlich'; end if;
  v_slug := nullif(trim(p_slug), '');
  if v_slug is null then raise exception 'Ungültiger Slug'; end if;
  while exists (select 1 from organizations where slug = v_slug) loop
    n := n + 1;
    v_slug := p_slug || '-' || n;
  end loop;
  insert into organizations (name, slug) values (trim(p_name), v_slug) returning id into v_org;
  insert into profiles (id, role, org_id) values (v_uid, 'admin', v_org);
  return v_slug;
end; $$;
grant execute on function public.bootstrap_org(text, text) to authenticated;

-- accept_invite: an authenticated user WITHOUT a profile redeems a single-use invite.
create or replace function public.accept_invite(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_inv org_invites; v_slug text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid) then raise exception 'bereits einer Organisation zugeordnet'; end if;
  select * into v_inv from org_invites where code = p_code;
  if v_inv.id is null then raise exception 'Einladung ungültig'; end if;
  if v_inv.accepted_at is not null then raise exception 'Einladung bereits eingelöst'; end if;
  if v_inv.expires_at < now() then raise exception 'Einladung abgelaufen'; end if;
  insert into profiles (id, role, org_id) values (v_uid, v_inv.role, v_inv.org_id);
  update org_invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  select slug into v_slug from organizations where id = v_inv.org_id;
  return v_slug;
end; $$;
grant execute on function public.accept_invite(text) to authenticated;

-- peek_invite: read-only org name + role for a valid unused code (signup preview).
create or replace function public.peek_invite(p_code text)
returns table (org_name text, member_role text)
language sql stable security definer set search_path = public as $$
  select o.name, i.role
  from org_invites i join organizations o on o.id = i.org_id
  where i.code = p_code and i.accepted_at is null and i.expires_at > now();
$$;
grant execute on function public.peek_invite(text) to anon, authenticated;

-- set_member_role / remove_member: admin-only, same-org, no self-target.
create or replace function public.set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'nur Admin'; end if;
  if p_role not in ('organizer','referee') then raise exception 'ungültige Rolle'; end if;
  if p_member = auth.uid() then raise exception 'eigene Rolle nicht änderbar'; end if;
  update profiles set role = p_role where id = p_member and org_id = public.current_org_id();
  if not found then raise exception 'Mitglied nicht in deiner Organisation'; end if;
end; $$;
grant execute on function public.set_member_role(uuid, text) to authenticated;

create or replace function public.remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'nur Admin'; end if;
  if p_member = auth.uid() then raise exception 'sich selbst nicht entfernbar'; end if;
  update profiles set org_id = null where id = p_member and org_id = public.current_org_id();
  if not found then raise exception 'Mitglied nicht in deiner Organisation'; end if;
end; $$;
grant execute on function public.remove_member(uuid) to authenticated;
```

- [ ] **Step 2: Apply via db2 + verify the guards.** Apply (db2 `apply_migration`). Verify with simulated-role queries: (a) a non-admin authenticated user calling `set_member_role`/`remove_member` raises 'nur Admin'; (b) `accept_invite` on an expired/used code raises; (c) a second `bootstrap_org` for a user who already has a profile raises 'bereits…'; (d) `peek_invite` on a valid code returns the org name+role and on an invalid code returns 0 rows. Record results.

- [ ] **Step 3: Commit the migration file.** `git add supabase/migrations/20260701090000_multi_tenant_2b.sql && git commit -m "feat: org_invites + is_admin() + signup/invite/member RPCs"`

## Task 2: Types

**Files:** Modify `web/src/lib/database.types.ts`.

- [ ] **Step 1:** Add the `org_invites` table type (Row/Insert/Update: id, org_id, code, role, created_by, expires_at, accepted_at, accepted_by, created_at; Relationships []). If the `Functions` block is typed in this file, add `bootstrap_org`, `accept_invite`, `peek_invite`, `set_member_role`, `remove_member` signatures; otherwise the actions call `supabase.rpc("name", args)` which is fine untyped — match the file's existing convention (check whether `confirm_match`/`report_match` appear under `Functions`).
- [ ] **Step 2: Build.** `cd web && npm run build` → PASS. **Step 3: Commit** `feat: types for org_invites (+ RPCs)`.

## Task 3: Pure invite helpers (TDD)

**Files:** Create `web/src/lib/org/invite.ts` + `web/src/lib/org/invite.test.ts`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { buildInviteUrl, isInviteUsable } from "./invite";

describe("isInviteUsable", () => {
  const now = new Date("2026-06-18T12:00:00Z");
  it("is true for a future, un-accepted invite", () => {
    expect(isInviteUsable({ expiresAt: "2026-06-25T12:00:00Z", acceptedAt: null }, now)).toBe(true);
  });
  it("is false when accepted or expired", () => {
    expect(isInviteUsable({ expiresAt: "2026-06-25T12:00:00Z", acceptedAt: "2026-06-19T00:00:00Z" }, now)).toBe(false);
    expect(isInviteUsable({ expiresAt: "2026-06-17T12:00:00Z", acceptedAt: null }, now)).toBe(false);
  });
});

describe("buildInviteUrl", () => {
  it("builds the signup URL with the code", () => {
    expect(buildInviteUrl("https://x.app", "abc")).toBe("https://x.app/signup?invite=abc");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd web && npx vitest run src/lib/org/invite.test.ts`

- [ ] **Step 3: Implement.**

```ts
export interface InviteStatus {
  expiresAt: string;
  acceptedAt: string | null;
}

/** Usable = not yet accepted and not past its expiry, relative to `now`. */
export function isInviteUsable(inv: InviteStatus, now: Date): boolean {
  if (inv.acceptedAt) return false;
  return new Date(inv.expiresAt).getTime() > now.getTime();
}

/** The shareable signup URL that redeems an invite code. */
export function buildInviteUrl(origin: string, code: string): string {
  return `${origin}/signup?invite=${encodeURIComponent(code)}`;
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit** `git add web/src/lib/org/invite.ts web/src/lib/org/invite.test.ts && git commit -m "feat: pure invite helpers (isInviteUsable, buildInviteUrl) with tests"`

## Task 4: Signup page + actions

**Files:**
- Create: `web/src/app/(auth)/signup/page.tsx`
- Create: `web/src/app/(auth)/signup/signup-form.tsx`
- Create: `web/src/app/(auth)/signup/actions.ts`
- Modify: `web/src/app/(auth)/login/page.tsx` (add a "Neue Firma? Registrieren" link to `/signup`)

- [ ] **Step 1: Actions** (`signup/actions.ts`, mirroring `login/actions.ts`'s state pattern). Two server actions both: validate, `supabase.auth.signUp({ email, password })` (server client — sets the session cookie; email-confirm OFF means a session is returned), then call the RPC, then `redirect`.

```ts
"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { orgSlug } from "@/lib/org/slug";

export type SignupState = { error?: string };

async function signUp(email: string, password: string): Promise<{ error?: string }> {
  if (!email || password.length < 8) {
    return { error: "E-Mail und ein Passwort (min. 8 Zeichen) erforderlich." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: "Registrierung fehlgeschlagen. E-Mail evtl. schon vergeben." };
  return {};
}

export async function signUpCreateOrg(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("orgName") ?? "").trim();
  if (!orgName) return { error: "Firmenname erforderlich." };
  const slug = orgSlug(orgName);
  if (!slug) return { error: "Firmenname ergibt keinen gültigen Namen." };

  const res = await signUp(email, password);
  if (res.error) return res;

  const supabase = await createClient();
  const { error } = await supabase.rpc("bootstrap_org", { p_name: orgName, p_slug: slug });
  if (error) return { error: "Organisation konnte nicht angelegt werden." };
  redirect("/organizer");
}

export async function signUpAcceptInvite(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!code) return { error: "Einladungscode fehlt." };

  const res = await signUp(email, password);
  if (res.error) return res;

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_code: code });
  if (error) return { error: "Einladung konnte nicht eingelöst werden (ungültig/abgelaufen?)." };
  redirect("/organizer");
}
```

- [ ] **Step 2: Page** (`signup/page.tsx`, server) — reads `?invite`; if present, calls `peek_invite` (via the server client) to show "Du trittst <org_name> als <role> bei" (or an "ungültig/abgelaufen" notice when no row); renders `SignupForm` with the relevant mode. Mirror the login page's centered card layout.

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Registrieren — Turnier-App" };

export default async function SignupPage(props: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await props.searchParams;
  let invitePreview: { orgName: string; role: string } | null = null;
  let inviteInvalid = false;
  if (invite) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("peek_invite", { p_code: invite });
    const row = Array.isArray(data) ? data[0] : null;
    if (row) invitePreview = { orgName: row.org_name, role: row.member_role };
    else inviteInvalid = true;
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12 sm:py-16">
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="font-display text-xl font-bold uppercase tracking-[0.08em] text-ink">
            Turnier<span className="text-lime">-App</span>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {invitePreview
              ? `Du trittst „${invitePreview.orgName}" als ${invitePreview.role} bei.`
              : inviteInvalid
                ? "Diese Einladung ist ungültig oder abgelaufen."
                : "Registriere deine Organisation."}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <SignupForm invite={invite ?? null} canSubmit={!inviteInvalid} />
        </div>
        <p className="mt-5 text-center text-sm text-fg-muted">
          Schon ein Konto?{" "}
          <Link href="/login" className="text-cyan hover:text-lime">
            Anmelden
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Form** (`signup-form.tsx`, client) — `useActionState`-style form (mirror `login-forms.tsx`). When `invite` is set, post to `signUpAcceptInvite` with a hidden `code` input; otherwise post to `signUpCreateOrg` with an extra `orgName` field. Disable submit when `!canSubmit`. Show the action's `error`.
- [ ] **Step 4: Login link.** Add a "Neue Firma? Registrieren" `Link` to `/signup` on the login page.
- [ ] **Step 5: Build + commit.** `cd web && npm run build`; commit `feat(design): self-serve signup (create org or accept invite)`.

## Task 5: Members page + actions

**Files:**
- Create: `web/src/app/organizer/members/actions.ts`
- Create: `web/src/app/organizer/members/page.tsx`
- Create: `web/src/app/organizer/members/members-client.tsx`

- [ ] **Step 1: Actions** (`members/actions.ts`). Use `requireStaff` for the supabase client; the RPCs enforce admin themselves, but also gate `createInvite`/`revokeInvite` on RLS (admin-of-org). `createInvite` generates a random code (`crypto.randomUUID()`), inserts into `org_invites` (org_id `= current_org_id()` is enforced by the RLS WITH CHECK; set it explicitly from the caller's profile), role, `expires_at = now + 7d`.

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";

export async function createInvite(role: "organizer" | "referee"): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase, orgId } = guard;
  if (!orgId) return { error: "Kein Org-Kontext." };
  const code = crypto.randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("org_invites").insert({
    org_id: orgId, code, role, expires_at: expires,
  });
  if (error) return { error: friendlyDbError(error, "Einladung konnte nicht erstellt werden (nur Admin).") };
  return { ok: true };
}

export async function revokeInvite(id: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { error } = await guard.supabase.from("org_invites").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error, "Einladung konnte nicht widerrufen werden.") };
  return { ok: true };
}

export async function setMemberRole(member: string, role: "organizer" | "referee"): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { error } = await guard.supabase.rpc("set_member_role", { p_member: member, p_role: role });
  if (error) return { error: friendlyDbError(error, "Rolle konnte nicht geändert werden.") };
  return { ok: true };
}

export async function removeMember(member: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { error } = await guard.supabase.rpc("remove_member", { p_member: member });
  if (error) return { error: friendlyDbError(error, "Mitglied konnte nicht entfernt werden.") };
  return { ok: true };
}
```

- [ ] **Step 2: Page** (`members/page.tsx`, server) — staff-gate; additionally require admin (`redirect("/organizer")` if `profile.role !== "admin"`). Load members (`profiles` where `org_id = my org` — the `profiles_select_same_org` policy permits it; select `id, role, display_name`), and the org's invites (`org_invites` select, RLS-scoped). Pass to `MembersClient` along with the current user id (to mark "du" + hide self-actions) and the request origin (for `buildInviteUrl`).
- [ ] **Step 3: Client** (`members-client.tsx`) — table of members (display_name or "—", role, "du" badge); per-row (except self) a role `<select>` (organizer/referee) calling `setMemberRole` + a "Entfernen" button calling `removeMember` (confirm). An "Mitglied einladen" control: role `<select>` + "Link erstellen" → `createInvite` → `router.refresh()`. Open-invites list using `isInviteUsable`: show role, expiry, and the copyable `buildInviteUrl(origin, code)` + "Widerrufen" (`revokeInvite`). Mirror existing brand table/button styles; `router.refresh()` after each action.
- [ ] **Step 4: Build + commit.** `cd web && npm run build`; commit `feat(design): admin members page (invite, role, remove)`.

## Task 6: Nav links

**Files:** Modify `web/src/components/brand/organizer-nav.tsx`.

- [ ] **Step 1:** Add a `isAdmin?: boolean` prop; when true, render a "Mitglieder" `Link` to `/organizer/members` (between "Spiele" and "Abmelden"). Pages that render `OrganizerNav` and know the role pass `isAdmin`; others omit it (link hidden). At minimum, the members page and the organizer landing compute `isAdmin` from the profile and pass it. (The members page is itself admin-gated, so direct navigation is safe regardless.)
- [ ] **Step 2: Build + commit.** Commit `feat: admin-only Mitglieder nav link`.

## Task 7: e2e + docs

**Files:** Create `web/e2e/signup.spec.ts`; modify `docs/DEPLOY.md`.

- [ ] **Step 1: e2e.** Public signup happy path: go to `/signup`, fill a unique email + password + org name, submit → lands on `/organizer` (or `/login` if email-confirm is unexpectedly on — assert one of the two and note). `afterAll`: delete the created org + profile + auth user via db2/the service client (so the test is repeatable). Invite redemption needs a second fresh auth user → covered by the db2 guard checks in Task 1, not e2e.
- [ ] **Step 2: docs.** Append a "Multi-Tenancy 2b" section to `docs/DEPLOY.md`: the `20260701090000_multi_tenant_2b.sql` migration (applied via db2); the **email-confirm OFF** assumption; `/signup` (create org or `?invite=<code>`); admin-only `/organizer/members`; single-use 7-day invites. Note Module 2 is complete.
- [ ] **Step 3: Verify + commit.** `cd web && npm run build && npm test`; commit `feat: signup e2e + docs (module 2 complete)`.

---

## Self-Review
- **Spec coverage:** org_invites + is_admin() + profiles_select_same_org + 5 RPCs (Task 1), types (Task 2), pure invite helpers (Task 3), signup/create-org/accept-invite (Task 4), admin members page incl. invite/role/remove/revoke (Task 5), nav (Task 6), e2e+docs (Task 7). Email-confirm-off assumption documented.
- **Security:** all profile-mutating paths go through SECURITY DEFINER RPCs guarded for no-profile-overwrite, admin-only, same-org, and no self-lockout; org_invites is admin-of-org RLS (codes never publicly listed); peek_invite returns only name+role for a valid code. Invite codes are random UUIDs. Verified via db2 in Task 1.
- **Type consistency:** `bootstrap_org(p_name,p_slug)`, `accept_invite(p_code)`, `peek_invite(p_code)->(org_name,member_role)`, `set_member_role(p_member,p_role)`, `remove_member(p_member)`, `is_admin()`; `isInviteUsable`/`buildInviteUrl` (invite.ts); `createInvite`/`revokeInvite`/`setMemberRole`/`removeMember` (members/actions.ts); `signUpCreateOrg`/`signUpAcceptInvite` (signup/actions.ts) — consistent across tasks.

## Done = all true
org_invites + is_admin() + the 5 RPCs + profiles_select_same_org migrated (db2, guards verified); `/signup` creates an org (user → admin) or redeems an invite; `/organizer/members` (admin) lists members, creates invite links, changes roles, removes members, revokes invites; no self-lockout / cross-org / profile-overwrite; invite helpers unit-tested; build + unit green; **Module 2 complete**.
