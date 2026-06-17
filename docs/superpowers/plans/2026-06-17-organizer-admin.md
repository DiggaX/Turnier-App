# Organizer-Admin Implementation Plan (Modul 1 — Turnier-CRUD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The organizer can create, configure, status-control and delete tournaments via the UI (with a per-tournament selectable team size), manage games, and view/edit/remove participants — and anonymous players can no longer write tournaments/games. See the design spec `docs/superpowers/specs/2026-06-17-organizer-admin-design.md`.

**Architecture:** Server Components for staff-gated pages (mirroring `organizer/tournaments/[id]/matches/page.tsx`), Server Actions for writes (a shared `requireStaff` guard + `friendlyDbError` + `ActionResult`), `react-hook-form` + `zod` forms (mirroring `register-client.tsx`), native `<select>` for dropdowns (no shadcn Select component exists), the existing shadcn/ui primitives + brand design system. Pure status/label logic is TDD-unit-tested. One migration adds `tournaments.team_size` and tightens the `tournaments`/`games` write RLS to staff-only.

**Tech Stack:** Next.js 16 (App Router, `web/`) · Supabase (Postgres, RLS) · react-hook-form + zod · qrcode.react (via `@/components/qr-code`) · Vitest · Playwright. Read `node_modules/next/dist/docs/` before writing Next code.

---

## Prerequisites — manual dashboard steps
Apply the Task 1 migration (`20260627090000_organizer_admin.sql`) in the Supabase SQL editor.

---

## Task 1: Migration — `team_size` + RLS hardening

**Files:** Create `supabase/migrations/20260627090000_organizer_admin.sql`.

- [ ] **Step 1: Write the migration.**

```sql
-- Modul 1: Organizer-Admin.
-- (a) Per-tournament team size (1 = 1v1, 5 = 5v5). The chosen game only seeds the
--     default in the create form; the tournament value is authoritative.
alter table tournaments add column if not exists team_size int not null default 1
  check (team_size >= 1);

-- (b) Security hardening: the original policies allowed ANY authenticated user
--     (incl. anonymous players) to write tournaments/games. Replace with staff-only,
--     matching matches/participants. Public SELECT stays.
drop policy if exists "tournaments_write_authenticated" on tournaments;
drop policy if exists "games_write_authenticated" on games;

create policy "tournaments_write_staff" on tournaments
  for all using (public.is_staff()) with check (public.is_staff());
create policy "games_write_staff" on games
  for all using (public.is_staff()) with check (public.is_staff());
```

- [ ] **Step 2: Apply it** in the Supabase SQL editor (the user does this). Verify staff `insert into games(name) values ('Test')` works and anon write is denied; verify `select team_size from tournaments limit 1` returns a value.

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/20260627090000_organizer_admin.sql
git commit -m "feat: tournaments.team_size + staff-only RLS for tournaments/games"
```

## Task 2: Types

**Files:** Modify `web/src/lib/database.types.ts`.

- [ ] **Step 1: Add `team_size` to the `tournaments` table type.** In the `tournaments` block, add `team_size: number` to `Row`, `team_size?: number` to `Insert`, and `team_size?: number` to `Update` (match neighbouring fields like `starts_at`).

- [ ] **Step 2: Build.** Run: `cd web && npm run build` → PASS.
- [ ] **Step 3: Commit.**

```bash
git add web/src/lib/database.types.ts
git commit -m "feat: types for tournaments.team_size"
```

## Task 3: Pure lifecycle helpers (TDD)

**Files:**
- Create: `web/src/lib/tournament/lifecycle.ts`
- Test: `web/src/lib/tournament/lifecycle.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { canEditStructure, nextStatus, teamLabel } from "./lifecycle";

describe("nextStatus", () => {
  it("advances draft->registration and running->finished", () => {
    expect(nextStatus("draft")).toBe("registration");
    expect(nextStatus("running")).toBe("finished");
  });
  it("has no guided next step from registration (generate starts it) or finished", () => {
    expect(nextStatus("registration")).toBeNull();
    expect(nextStatus("finished")).toBeNull();
  });
});

describe("canEditStructure", () => {
  it("allows game/format edits only while no matches exist", () => {
    expect(canEditStructure("draft", false)).toBe(true);
    expect(canEditStructure("registration", false)).toBe(true);
    expect(canEditStructure("running", true)).toBe(false);
    expect(canEditStructure("draft", true)).toBe(false);
  });
});

describe("teamLabel", () => {
  it("renders solo and NvN", () => {
    expect(teamLabel(1)).toBe("Solo");
    expect(teamLabel(2)).toBe("2v2");
    expect(teamLabel(5)).toBe("5v5");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd web && npx vitest run src/lib/tournament/lifecycle.test.ts` → FAIL.

- [ ] **Step 3: Implement.**

```ts
import type { TournamentStatus } from "@/lib/database.types";

/** The single guided next status, or null when there's no guided forward step. */
export function nextStatus(current: TournamentStatus): TournamentStatus | null {
  if (current === "draft") return "registration";
  if (current === "running") return "finished";
  // registration -> running happens via bracket generation, not a status button.
  return null;
}

/** Game/format may only change while the bracket has not been generated yet. */
export function canEditStructure(
  _status: TournamentStatus,
  hasMatches: boolean,
): boolean {
  return !hasMatches;
}

/** Display label for a team size: "Solo" for 1, otherwise "NvN". */
export function teamLabel(teamSize: number): string {
  return teamSize > 1 ? `${teamSize}v${teamSize}` : "Solo";
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `cd web && npx vitest run src/lib/tournament/lifecycle.test.ts` → PASS.
- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/tournament/lifecycle.ts web/src/lib/tournament/lifecycle.test.ts
git commit -m "feat: tournament lifecycle helpers (nextStatus, canEditStructure, teamLabel) with tests"
```

## Task 4: Ripple — read team size from the tournament, not the game

**Files (read each first):**
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/app/t/[tournamentId]/page.tsx`
- Modify: `web/src/app/t/[tournamentId]/register/page.tsx`
- Modify: `web/src/app/t/[tournamentId]/board/page.tsx` (only if it reads `game.team_size`)

- [ ] **Step 1: Switch the reads.** In each page, add `team_size` to the `tournaments` select and use `tournament.team_size` (falling back to `1`) wherever the code currently uses the embedded game's `team_size`:
  - `page.tsx` (home): select adds `team_size`; `const teamSize = t.team_size ?? 1;` replaces `t.games?.team_size`. Use `teamLabel(teamSize)` (import from `@/lib/tournament/lifecycle`) for the `Nv N`/Solo text where it builds `gameLine`.
  - `t/[tournamentId]/page.tsx` (detail): same — `tournament.team_size ?? 1`, and `isTeam = teamSize > 1`.
  - `register/page.tsx`: select `team_size` on the tournament; pass `teamSize={tournament.team_size ?? 1}` to `RegisterClient` instead of `tournament.game?.team_size`.
  - `board/page.tsx`: if it derives a team label from `game.team_size`, switch to `tournament.team_size`.

- [ ] **Step 2: Build.** Run: `cd web && npm run build` → PASS (the embedded `games(team_size)` may stay in selects harmlessly, but prefer removing it where now unused).
- [ ] **Step 3: Commit.**

```bash
git add web/src/app/page.tsx "web/src/app/t/[tournamentId]/page.tsx" "web/src/app/t/[tournamentId]/register/page.tsx" "web/src/app/t/[tournamentId]/board/page.tsx"
git commit -m "feat: read team size from tournament.team_size (not game)"
```

## Task 5: Shared staff guard + create-tournament action + page

**Files:**
- Create: `web/src/lib/auth/staff.ts`
- Create: `web/src/app/organizer/tournaments/actions.ts`
- Create: `web/src/app/organizer/tournaments/new/page.tsx`
- Create: `web/src/app/organizer/tournaments/new/new-tournament-form.tsx`
- Modify: `web/src/app/organizer/page.tsx` (add the "Neues Turnier" button)

- [ ] **Step 1: Shared staff guard** (extracted so all new action files reuse it; mirrors the local `requireStaff` in `bracket/actions.ts`).

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ActionResult = { ok: true } | { error: string };

/** Verify the caller is a signed-in staff member; return the client or an error. */
export async function requireStaff(): Promise<
  { supabase: Supabase } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    return { error: "Diese Aktion ist nicht erlaubt." };
  }
  return { supabase };
}
```

- [ ] **Step 2: Tournament server actions** (create now; update/status/delete added in Task 6 — put them all in this one file).

```ts
"use server";

import { redirect } from "next/navigation";

import type { Database, TournamentFormat, TournamentMode } from "@/lib/database.types";
import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";

const FORMATS: TournamentFormat[] = [
  "single_elim",
  "double_elim",
  "round_robin",
  "swiss",
  "groups_playoffs",
];
const MODES: TournamentMode[] = ["lan", "online", "hybrid"];

export type CreateTournamentInput = {
  name: string;
  gameId: string;
  format: string;
  mode: string;
  teamSize: number;
  startsAt: string | null;
};

/** Create a draft tournament owned by the caller, then redirect to its overview. */
export async function createTournament(
  input: CreateTournamentInput,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const name = input.name?.trim();
  if (!name) return { error: "Name ist erforderlich." };
  if (!input.gameId) return { error: "Bitte ein Spiel wählen." };
  if (!FORMATS.includes(input.format as TournamentFormat)) {
    return { error: "Ungültiges Format." };
  }
  if (!MODES.includes(input.mode as TournamentMode)) {
    return { error: "Ungültiger Modus." };
  }
  const teamSize = Number(input.teamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    return { error: "Teamgröße muss mindestens 1 sein." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row: Database["public"]["Tables"]["tournaments"]["Insert"] = {
    name,
    game_id: input.gameId,
    format: input.format as TournamentFormat,
    mode: input.mode as TournamentMode,
    team_size: teamSize,
    status: "draft",
    starts_at: input.startsAt || null,
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("tournaments")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    return { error: friendlyDbError(error, "Turnier konnte nicht angelegt werden.") };
  }
  redirect(`/organizer/tournaments/${data.id}`);
}
```

- [ ] **Step 3: Create page** (server, staff-gated, loads games for the dropdown).

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { createClient } from "@/lib/supabase/server";

import { NewTournamentForm } from "./new-tournament-form";

export const metadata: Metadata = { title: "Neues Turnier — Turnier-App" };

export default async function NewTournamentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const { data: games } = await supabase
    .from("games")
    .select("id, name, team_size")
    .order("name", { ascending: true });

  return (
    <>
      <OrganizerNav />
      <main className="relative flex-1 overflow-hidden">
        <div className="relative mx-auto w-full max-w-xl px-5 pb-20 pt-10 sm:px-8">
          <h1 className="mb-6 font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
            Neues Turnier
          </h1>
          <NewTournamentForm games={games ?? []} />
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Create form** (client, rhf + zod, native selects).

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTournament } from "../actions";

const FORMAT_OPTIONS = [
  { value: "single_elim", label: "Single Elimination" },
  { value: "double_elim", label: "Double Elimination" },
  { value: "round_robin", label: "Round Robin" },
  { value: "swiss", label: "Swiss-System" },
  { value: "groups_playoffs", label: "Gruppen → Playoffs" },
];
const MODE_OPTIONS = [
  { value: "hybrid", label: "Hybrid" },
  { value: "lan", label: "LAN" },
  { value: "online", label: "Online" },
];

const schema = z.object({
  name: z.string().trim().min(1, "Name erforderlich"),
  gameId: z.string().min(1, "Spiel wählen"),
  format: z.string().min(1),
  mode: z.string().min(1),
  teamSize: z.coerce.number().int().min(1, "Mindestens 1"),
  startsAt: z.string().optional(),
});
type Values = z.infer<typeof schema>;

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-line bg-bg px-3 font-display text-sm text-ink outline-none focus:border-lime/60";

export function NewTournamentForm({
  games,
}: {
  games: { id: string; name: string; team_size: number }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      gameId: games[0]?.id ?? "",
      format: "single_elim",
      mode: "hybrid",
      teamSize: games[0]?.team_size ?? 1,
      startsAt: "",
    },
  });

  async function onSubmit(values: Values) {
    setError(null);
    const res = await createTournament({
      name: values.name,
      gameId: values.gameId,
      format: values.format,
      mode: values.mode,
      teamSize: values.teamSize,
      startsAt: values.startsAt ? values.startsAt : null,
    });
    if (res && "error" in res) setError(res.error);
    // success path redirects server-side
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-xs text-live">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="gameId">Spiel</Label>
        <select
          id="gameId"
          className={SELECT_CLASS}
          {...register("gameId")}
          onChange={(e) => {
            const g = games.find((x) => x.id === e.target.value);
            if (g) setValue("teamSize", g.team_size);
          }}
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="format">Format</Label>
        <select id="format" className={SELECT_CLASS} {...register("format")}>
          {FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mode">Modus</Label>
        <select id="mode" className={SELECT_CLASS} {...register("mode")}>
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="teamSize">Teamgröße (1 = 1v1, 5 = 5v5)</Label>
        <Input id="teamSize" type="number" min={1} {...register("teamSize")} />
        {errors.teamSize && (
          <p className="text-xs text-live">{errors.teamSize.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="startsAt">Start (optional)</Label>
        <Input id="startsAt" type="datetime-local" {...register("startsAt")} />
      </div>

      {error && <p className="text-sm text-live">{error}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Wird angelegt…" : "Turnier anlegen"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Add the "Neues Turnier" button** to `organizer/page.tsx` — a `Link` to `/organizer/tournaments/new` styled as a lime button, placed in the header next to "Turniere".

```tsx
// import Link is already present; add near the page heading:
<Link
  href="/organizer/tournaments/new"
  className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-lime px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90"
>
  ＋ Neues Turnier
</Link>
```

- [ ] **Step 6: Build.** Run: `cd web && npm run build` → PASS.
- [ ] **Step 7: Commit.**

```bash
git add web/src/lib/auth/staff.ts "web/src/app/organizer/tournaments/actions.ts" "web/src/app/organizer/tournaments/new/page.tsx" "web/src/app/organizer/tournaments/new/new-tournament-form.tsx" web/src/app/organizer/page.tsx
git commit -m "feat(design): create-tournament form + action + shared staff guard"
```

## Task 6: Tournament overview / edit / status / delete

**Files:**
- Modify: `web/src/app/organizer/tournaments/actions.ts` (append update/status/delete actions)
- Create: `web/src/app/organizer/tournaments/[id]/page.tsx` (overview — the "Übersicht" tab)
- Create: `web/src/app/organizer/tournaments/[id]/edit-tournament-form.tsx`
- Create: `web/src/app/organizer/tournaments/[id]/lifecycle-controls.tsx`
- Modify: `web/src/components/brand/tournament-tabs.tsx` (link "Übersicht")

- [ ] **Step 1: Append the actions** to `organizer/tournaments/actions.ts`:

```ts
import { nextStatus } from "@/lib/tournament/lifecycle";

export type UpdateTournamentInput = {
  id: string;
  name: string;
  gameId: string;
  format: string;
  mode: string;
  teamSize: number;
  startsAt: string | null;
};

/** Update editable fields. game/format only change while no matches exist. */
export async function updateTournament(
  input: UpdateTournamentInput,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const name = input.name?.trim();
  if (!name) return { error: "Name ist erforderlich." };
  const teamSize = Number(input.teamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1) {
    return { error: "Teamgröße muss mindestens 1 sein." };
  }

  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", input.id);
  const hasMatches = (count ?? 0) > 0;

  const patch: Database["public"]["Tables"]["tournaments"]["Update"] = {
    name,
    mode: input.mode as TournamentMode,
    team_size: teamSize,
    starts_at: input.startsAt || null,
  };
  if (!hasMatches) {
    patch.game_id = input.gameId;
    patch.format = input.format as TournamentFormat;
  }

  const { error } = await supabase
    .from("tournaments")
    .update(patch)
    .eq("id", input.id);
  if (error) {
    return { error: friendlyDbError(error, "Turnier konnte nicht gespeichert werden.") };
  }
  return { ok: true };
}

/** Move the tournament to its guided next status (draft->registration, running->finished). */
export async function advanceStatus(
  id: string,
  current: string,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;

  const target = nextStatus(current as TournamentMode extends never ? never : Parameters<typeof nextStatus>[0]);
  if (!target) return { error: "Kein gültiger nächster Status." };

  const { error } = await supabase
    .from("tournaments")
    .update({ status: target })
    .eq("id", id)
    .eq("status", current); // optimistic guard: only if status hasn't moved
  if (error) {
    return { error: friendlyDbError(error, "Status konnte nicht geändert werden.") };
  }
  return { ok: true };
}

/** Delete a tournament (cascades matches/participants via FKs). */
export async function deleteTournament(id: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { supabase } = guard;
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) {
    return { error: friendlyDbError(error, "Turnier konnte nicht gelöscht werden.") };
  }
  return { ok: true };
}
```

> Note: the `nextStatus` cast above is awkward — simplify to `nextStatus(current as TournamentStatus)` and add `import type { TournamentStatus } from "@/lib/database.types"`. Use that clean form.

- [ ] **Step 2: Overview page** `[id]/page.tsx` (server, staff-gated): load tournament (with game name + team_size + status), participant count, and whether matches exist; render facts + `EditTournamentForm` + `LifecycleControls`.

```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OrganizerNav } from "@/components/brand/organizer-nav";
import { TournamentTabs } from "@/components/brand/tournament-tabs";
import { StatusBadge } from "@/components/brand/status-badge";
import { formatLabel, modeLabel } from "@/lib/labels";
import { teamLabel } from "@/lib/tournament/lifecycle";
import { createClient } from "@/lib/supabase/server";

import { EditTournamentForm } from "./edit-tournament-form";
import { LifecycleControls } from "./lifecycle-controls";

export const metadata: Metadata = { title: "Übersicht — Turnier-App" };

export default async function TournamentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["admin", "organizer", "referee"].includes(profile.role)) {
    redirect("/login");
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, format, mode, status, team_size, starts_at, game_id, games(name)")
    .eq("id", id)
    .maybeSingle();
  if (!tournament) notFound();

  const [{ count: pCount }, { count: mCount }, { data: games }] = await Promise.all([
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("tournament_id", id),
    supabase.from("games").select("id, name, team_size").order("name"),
  ]);
  const hasMatches = (mCount ?? 0) > 0;

  return (
    <>
      <OrganizerNav />
      <main className="relative flex-1 overflow-hidden">
        <div className="relative mx-auto w-full max-w-3xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
          <div className="mb-5">
            <div className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              Organizer · Übersicht
            </div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
              {tournament.name}
            </h1>
          </div>

          <TournamentTabs tournamentId={id} />

          <section className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-5">
            <StatusBadge status={tournament.status} />
            <span className="text-sm text-fg-muted">{tournament.games?.name}</span>
            <span className="text-sm text-fg-muted">{formatLabel(tournament.format)}</span>
            <span className="text-sm text-fg-muted">{modeLabel(tournament.mode)}</span>
            <span className="text-sm text-fg-muted">{teamLabel(tournament.team_size)}</span>
            <span className="text-sm text-fg-muted">{pCount ?? 0} Teilnehmer</span>
          </section>

          <LifecycleControls
            tournamentId={id}
            status={tournament.status}
            hasMatches={hasMatches}
          />

          <section className="mt-8">
            <h2 className="mb-4 font-display text-[11px] uppercase tracking-[0.18em] text-fg-dim">
              Bearbeiten
            </h2>
            <EditTournamentForm
              games={games ?? []}
              tournament={{
                id: tournament.id,
                name: tournament.name,
                gameId: tournament.game_id,
                format: tournament.format,
                mode: tournament.mode,
                teamSize: tournament.team_size,
                startsAt: tournament.starts_at,
              }}
              canEditStructure={!hasMatches}
            />
          </section>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Edit form** `edit-tournament-form.tsx` — like the create form but prefilled and calling `updateTournament`; when `canEditStructure` is false, render the game/format selects `disabled` with a hint. (Reuse the same `SELECT_CLASS`, `FORMAT_OPTIONS`, `MODE_OPTIONS` — copy them into this file or extract a shared `web/src/app/organizer/tournaments/options.ts`; extracting is cleaner.) On success show a "Gespeichert" note and `router.refresh()`.

- [ ] **Step 4: Lifecycle controls** `lifecycle-controls.tsx` (client):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { TournamentStatus } from "@/lib/database.types";
import { nextStatus } from "@/lib/tournament/lifecycle";
import { advanceStatus, deleteTournament } from "./../actions";

const NEXT_LABEL: Record<string, string> = {
  registration: "Anmeldung öffnen",
  finished: "Turnier beenden",
};

export function LifecycleControls({
  tournamentId,
  status,
  hasMatches,
}: {
  tournamentId: string;
  status: TournamentStatus;
  hasMatches: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const target = nextStatus(status);

  function advance() {
    setError(null);
    startTransition(async () => {
      const res = await advanceStatus(tournamentId, status);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }
  function remove() {
    if (!window.confirm("Turnier wirklich löschen? Das entfernt alle Matches und Teilnehmer.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTournament(tournamentId);
      if ("error" in res) setError(res.error);
      else router.push("/organizer");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {target && (
        <button
          type="button"
          onClick={advance}
          disabled={pending}
          className="rounded-[10px] bg-lime px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {NEXT_LABEL[target] ?? target}
        </button>
      )}
      {status === "registration" && (
        <span className="font-display text-xs uppercase tracking-[0.12em] text-fg-dim">
          Zum Starten: Bracket im Tab „Bracket" generieren.
        </span>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-[10px] border border-live/40 bg-live/10 px-5 py-2.5 font-display text-xs font-bold uppercase tracking-wider text-live transition-colors hover:bg-live/20 disabled:opacity-50"
      >
        Löschen
      </button>
      {error && <p className="w-full text-sm text-live">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Link the "Übersicht" tab.** In `tournament-tabs.tsx`, change the `Übersicht` entry from `{ label: "Übersicht", segment: null }` to use the tournament base route. Since other tabs append `/segment`, special-case `Übersicht` to link to the base `/organizer/tournaments/[id]` (segment `""`). Simplest: set its `segment` to `""` and build `href = segment ? \`${base}/${segment}\` : base`. Update the placeholder logic so `Übersicht` is now a real link (only it changes; everything else stays). Also update the organizer landing link target from `/participants` to the overview base (`/organizer/tournaments/${id}`).

- [ ] **Step 6: Build + commit.**

```bash
cd web && npm run build
git add "web/src/app/organizer/tournaments/actions.ts" "web/src/app/organizer/tournaments/[id]/page.tsx" "web/src/app/organizer/tournaments/[id]/edit-tournament-form.tsx" "web/src/app/organizer/tournaments/[id]/lifecycle-controls.tsx" "web/src/app/organizer/tournaments/options.ts" web/src/components/brand/tournament-tabs.tsx web/src/app/organizer/page.tsx
git commit -m "feat(design): tournament overview, edit, status lifecycle + delete"
```

## Task 7: Games management

**Files:**
- Create: `web/src/app/organizer/games/actions.ts`
- Create: `web/src/app/organizer/games/page.tsx`
- Create: `web/src/app/organizer/games/games-manager.tsx`
- Modify: `web/src/components/brand/organizer-nav.tsx` (add a "Spiele" link — read it first)

- [ ] **Step 1: Games actions.**

```ts
"use server";

import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";

export async function createGame(name: string, teamSize: number): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const n = name?.trim();
  if (!n) return { error: "Name ist erforderlich." };
  if (!Number.isInteger(teamSize) || teamSize < 1) return { error: "Teamgröße ≥ 1." };
  const { error } = await guard.supabase.from("games").insert({ name: n, team_size: teamSize });
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht angelegt werden.") };
  return { ok: true };
}

export async function updateGame(id: string, name: string, teamSize: number): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const n = name?.trim();
  if (!n) return { error: "Name ist erforderlich." };
  if (!Number.isInteger(teamSize) || teamSize < 1) return { error: "Teamgröße ≥ 1." };
  const { error } = await guard.supabase.from("games").update({ name: n, team_size: teamSize }).eq("id", id);
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht gespeichert werden.") };
  return { ok: true };
}

/** Delete a game only when no tournament references it. */
export async function deleteGame(id: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { count } = await guard.supabase
    .from("tournaments")
    .select("id", { count: "exact", head: true })
    .eq("game_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Spiel wird von ${count} Turnier(en) genutzt und kann nicht gelöscht werden.` };
  }
  const { error } = await guard.supabase.from("games").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error, "Spiel konnte nicht gelöscht werden.") };
  return { ok: true };
}
```

- [ ] **Step 2: Games page** (server, staff-gated, loads games) rendering a `GamesManager` client component.
- [ ] **Step 3: GamesManager** (client): a table of games each with inline name + team_size edit (Input) + "Speichern" (updateGame) + "Löschen" (deleteGame, with confirm + error display), plus an "add game" row (name + team_size + createGame). `router.refresh()` after each successful action. Mirror the existing brand table/button styling.
- [ ] **Step 4: Nav link.** Add a "Spiele" link to `organizer-nav.tsx` pointing to `/organizer/games`.
- [ ] **Step 5: Build + commit.**

```bash
cd web && npm run build
git add "web/src/app/organizer/games/actions.ts" "web/src/app/organizer/games/page.tsx" "web/src/app/organizer/games/games-manager.tsx" web/src/components/brand/organizer-nav.tsx
git commit -m "feat(design): games management (list, add, edit, delete-if-unused)"
```

## Task 8: Participant detail

**Files:**
- Create: `web/src/app/organizer/tournaments/[id]/participants/actions.ts`
- Create: `web/src/app/organizer/tournaments/[id]/participants/[pid]/page.tsx`
- Create: `web/src/app/organizer/tournaments/[id]/participants/[pid]/participant-detail-client.tsx`
- Modify: `web/src/app/organizer/tournaments/[id]/participants/page.tsx` (link rows to detail)

- [ ] **Step 1: Participant actions.**

```ts
"use server";

import { friendlyDbError } from "@/lib/db-errors";
import { requireStaff, type ActionResult } from "@/lib/auth/staff";

export async function updateParticipant(
  id: string,
  displayName: string,
  gamertag: string | null,
): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const name = displayName?.trim();
  if (!name) return { error: "Anzeigename ist erforderlich." };
  const { error } = await guard.supabase
    .from("participants")
    .update({ display_name: name, gamertag: gamertag?.trim() || null })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error, "Teilnehmer konnte nicht gespeichert werden.") };
  return { ok: true };
}

export async function removeParticipant(id: string): Promise<ActionResult> {
  const guard = await requireStaff();
  if ("error" in guard) return guard;
  const { error } = await guard.supabase.from("participants").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error, "Teilnehmer konnte nicht entfernt werden.") };
  return { ok: true };
}
```

- [ ] **Step 2: Detail page** (server, staff-gated): load the participant (`id, display_name, gamertag, birthdate, type, qr_token, checked_in_at, consents(id)`) scoped to the tournament; `notFound()` if missing. Render facts + a QR via `@/components/qr-code` (read that file for its prop name — likely `value`; pass `participant.qr_token`) + the `ParticipantDetailClient` for edit/remove.
- [ ] **Step 3: Detail client** (`participant-detail-client.tsx`): an edit form (display_name + gamertag → `updateParticipant`, `router.refresh()` on success) and a "Entfernen" button (`window.confirm` → `removeParticipant` → `router.push(\`/organizer/tournaments/${tournamentId}/participants\`)`).
- [ ] **Step 4: Link the list.** In `participants/page.tsx`, wrap each row's name cell (or the row) in a `Link` to `/organizer/tournaments/${id}/participants/${participant.id}`. Add `id` is already selected.
- [ ] **Step 5: Build + commit.**

```bash
cd web && npm run build
git add "web/src/app/organizer/tournaments/[id]/participants/actions.ts" "web/src/app/organizer/tournaments/[id]/participants/[pid]/page.tsx" "web/src/app/organizer/tournaments/[id]/participants/[pid]/participant-detail-client.tsx" "web/src/app/organizer/tournaments/[id]/participants/page.tsx"
git commit -m "feat(design): participant detail (view, edit, remove, QR)"
```

## Task 9: e2e + docs

**Files:**
- Create: `web/e2e/organizer-admin.spec.ts`
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Write the e2e.** Mirror the organizer-login helper in `web/e2e/swiss.spec.ts` (read it first). Flow, all via the UI with the organizer logged in:
  - Go to `/organizer/games`, add a game "E2E Game" with team size 1 (skip if it already exists).
  - Go to `/organizer/tournaments/new`, fill name (unique, e.g. `E2E Admin <timestamp from Date via the page>` — use a fixed unique suffix passed through the test), pick the game, format single_elim, team size 1, submit → lands on the overview.
  - On the overview, click "Anmeldung öffnen" → status badge shows registration.
  - Visit `/t/<id>/register` and assert the form renders (no 404) — proves registration is open.
  - `afterAll`: delete the created tournament (and the game if created) via the organizer service client.

```ts
// web/e2e/organizer-admin.spec.ts — structure (fill helpers by mirroring swiss.spec.ts)
import { expect, test } from "@playwright/test";
// ...organizer login + service-client cleanup helpers from swiss.spec.ts...

test.describe("Organizer admin", () => {
  // afterAll: delete the created tournament (capture its id after creation)
  test("create tournament, open registration, register reachable", async ({ page }) => {
    // login as organizer (mirror swiss.spec.ts)
    await page.goto("/organizer/tournaments/new");
    await page.getByLabel("Name").fill(`E2E Admin ${uniqueSuffix}`);
    // select game / format / team size, submit
    // assert URL is /organizer/tournaments/<id>
    // click "Anmeldung öffnen", assert status badge registration
    // goto /t/<id>/register, assert the register form heading is visible (not 404)
  });
});
```

- [ ] **Step 2: Run the e2e.** Run: `cd web && npx playwright test e2e/organizer-admin.spec.ts` → PASS. If the sandbox can't run a browser/dev-server, write the spec correctly + note deferred — build + unit MUST be green.

- [ ] **Step 3: Update `docs/DEPLOY.md`.** Append an "Organizer-Admin (Modul 1)" section: the `20260627090000_organizer_admin.sql` migration (adds `tournaments.team_size`; **hardens** `tournaments`/`games` writes to staff-only — note this closes a hole where anon players could modify them); the new organizer routes (`/organizer/tournaments/new`, `/organizer/tournaments/[id]` overview, `/organizer/games`, participant detail); the guided status flow; team size is now per-tournament.

- [ ] **Step 4: Full verification.** Run: `cd web && npm run build && npm test && npx playwright test` → build clean; unit green (incl. lifecycle); e2e green or deferred.

- [ ] **Step 5: Commit.**

```bash
git add web/e2e/organizer-admin.spec.ts docs/DEPLOY.md
git commit -m "feat: organizer-admin e2e + docs"
```

---

## Self-Review

- **Spec coverage:** create tournament w/ selectable team size (Task 5), overview/edit/status/delete (Task 6), games management (Task 7), participant detail view/edit/remove/QR (Task 8), security RLS hardening + team_size column (Task 1), team_size ripple (Task 4), lifecycle helpers (Task 3), e2e + docs (Task 9). Multi-tenancy explicitly out of scope (Modul 2).
- **Security:** the migration replaces the permissive `to authenticated using(true)` write policies on `tournaments`/`games` with `is_staff()`; every server action is `requireStaff`-guarded; the `advanceStatus`/`deleteTournament` writes are also RLS-protected; participant PII (birthdate) is only shown on the staff-gated detail page.
- **Type consistency:** `requireStaff`/`ActionResult` (lib/auth/staff.ts), `createTournament`/`updateTournament`/`advanceStatus`/`deleteTournament` + their input types (tournaments/actions.ts), `createGame`/`updateGame`/`deleteGame` (games/actions.ts), `updateParticipant`/`removeParticipant` (participants/actions.ts), `nextStatus`/`canEditStructure`/`teamLabel` (lifecycle.ts) — names used consistently. The awkward `nextStatus` cast in Task 6 Step 1 is corrected to `nextStatus(current as TournamentStatus)` in the note.

## Done = all true
Migration applied (team_size + staff-only RLS); organizer can create a tournament with a chosen team size, edit it, open registration, finish, delete; manage games (add/edit/delete-if-unused); view/edit/remove participants + see their QR; players can register once registration is open; anon can no longer write tournaments/games; team labels read from `tournament.team_size`; lifecycle helpers unit-tested; build + unit + e2e green.
