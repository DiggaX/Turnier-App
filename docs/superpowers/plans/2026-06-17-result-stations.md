# Result Stations Implementation Plan (Plan 11 — Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A fullscreen, touch-friendly **result station** kiosk at `/organizer/tournaments/[id]/station` where staff at a match table enter and confirm results directly. It lists the currently **playable** matches (both slots filled, not yet decided) as large cards; each card has score entry + a "Freigeben" button that confirms the result. Realtime keeps stations and the public board in sync — a confirmed match drops off the list and any newly-playable match appears. This wires up the existing dimmed **"Stationen"** organizer tab.

**Architecture:** Pure UI/kiosk assembly over existing pieces — **no schema change**. Reuses `ConfirmForm` (score entry → the staff-only `confirm_match` RPC, with direct-entry support and draw rejection already built in), the `matches` query + staff guard from the organizer matches page, and the Supabase Realtime channel pattern from `live-board.tsx`. Two tiny pure helpers (which matches are playable; the agreed player-reported score for prefill) are TDD-unit-tested; the kiosk shell + realtime are integration (the board's identical pattern is already in production).

**Tech Stack:** Next.js 16 (App Router, `web/`) · Supabase (Postgres RPC + Realtime) · Vitest. Read `node_modules/next/dist/docs/` before writing Next code.

**No database migration.** `confirm_match` already exists and is staff-guarded; `matches` already has everything needed; Realtime on `matches` is already enabled (the live board uses it).

---

## Prerequisites — manual dashboard steps
**None.** (Realtime on `matches` was enabled in the Plan-6 board work.)

---

## Task 1: Pure station helpers (TDD)

**Files:**
- Create: `web/src/lib/station/station.ts`
- Test: `web/src/lib/station/station.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { agreedScore, isPlayable, type StationMatch, type Report } from "./station";

const mk = (over: Partial<StationMatch> = {}): StationMatch => ({
  status: "pending",
  participantAId: "p1",
  participantBId: "p2",
  ...over,
});

describe("isPlayable", () => {
  it("is true for pending/live matches with both slots filled", () => {
    expect(isPlayable(mk({ status: "pending" }))).toBe(true);
    expect(isPlayable(mk({ status: "live" }))).toBe(true);
  });
  it("is false for done/bye or an empty slot", () => {
    expect(isPlayable(mk({ status: "done" }))).toBe(false);
    expect(isPlayable(mk({ status: "bye" }))).toBe(false);
    expect(isPlayable(mk({ participantBId: null }))).toBe(false);
  });
});

describe("agreedScore", () => {
  const r = (a: number, b: number): Report => ({ scoreA: a, scoreB: b });
  it("returns the score when all reports agree", () => {
    expect(agreedScore([r(2, 1), r(2, 1)])).toEqual({ scoreA: 2, scoreB: 1 });
    expect(agreedScore([r(3, 0)])).toEqual({ scoreA: 3, scoreB: 0 });
  });
  it("returns null when reports conflict or there are none", () => {
    expect(agreedScore([r(2, 1), r(1, 2)])).toBeNull();
    expect(agreedScore([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd web && npx vitest run src/lib/station/station.test.ts` → FAIL.

- [ ] **Step 3: Implement.**

```ts
/** Minimal match shape the station needs to decide playability. */
export interface StationMatch {
  status: string;
  participantAId: string | null;
  participantBId: string | null;
}

/** A player-reported score for a match (both sides use the same orientation). */
export interface Report {
  scoreA: number;
  scoreB: number;
}

/** Playable = not yet decided (pending/live) with both opponents present. */
export function isPlayable(m: StationMatch): boolean {
  return (
    (m.status === "pending" || m.status === "live") &&
    m.participantAId !== null &&
    m.participantBId !== null
  );
}

/**
 * The agreed score to prefill the station's entry: returned only when every
 * report carries the same (scoreA, scoreB). Null when reports conflict or there
 * are none, so the referee must enter it.
 */
export function agreedScore(reports: Report[]): Report | null {
  if (reports.length === 0) return null;
  const first = reports[0];
  const allAgree = reports.every(
    (r) => r.scoreA === first.scoreA && r.scoreB === first.scoreB,
  );
  return allAgree ? { scoreA: first.scoreA, scoreB: first.scoreB } : null;
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `cd web && npx vitest run src/lib/station/station.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/lib/station/station.ts web/src/lib/station/station.test.ts
git commit -m "feat: pure station helpers (isPlayable + agreedScore) with tests"
```

## Task 2: Station kiosk shell (realtime + fullscreen)

**Files:** Create `web/src/app/organizer/tournaments/[id]/station/station-board.tsx`.

A client shell mirroring `live-board.tsx`: it opens a Realtime channel on `matches` for this tournament and calls `router.refresh()` on any change, and offers a fullscreen toggle. It renders its children (the match cards) in a kiosk frame.

- [ ] **Step 1: Write it** (read `web/src/app/t/[tournamentId]/board/live-board.tsx` first and mirror its realtime + fullscreen logic, including the Strict-Mode `startedRef` guard and the try/catch around `subscribe`).

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export type StationBoardProps = {
  tournamentId: string;
  children: React.ReactNode;
};

/**
 * Staff result-station shell: realtime-refreshes on any `matches` change for the
 * tournament (so confirmed matches drop off and newly-playable ones appear
 * across all stations) and offers a fullscreen toggle for kiosk use. Realtime is
 * best-effort — a normal reload always reflects the latest state.
 */
export function StationBoard({ tournamentId, children }: StationBoardProps) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const supabase = createClient();
    const channel = supabase.channel(`station-${tournamentId}`);
    try {
      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "matches",
            filter: `tournament_id=eq.${tournamentId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    } catch {
      // Realtime not enabled — station still renders server data.
    }
    return () => {
      startedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen blocked — ignore.
    }
  }

  return (
    <div className="min-h-[calc(100vh-49px)] bg-[radial-gradient(900px_600px_at_50%_-10%,rgba(197,247,46,0.10),transparent_60%)]">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 pt-6 sm:px-10">
        <div className="flex items-center gap-2.5 rounded-[10px] border border-lime/40 bg-lime/[0.13] px-4 py-2.5 font-display text-sm uppercase tracking-[0.16em] text-lime">
          Station · Ergebnis-Eingabe
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-2 rounded-[10px] border border-cyan/40 bg-cyan/[0.06] px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-cyan transition-colors hover:bg-cyan/15"
        >
          {isFullscreen ? "Vollbild verlassen" : "⛶ Vollbild"}
        </button>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit.**

```bash
git add "web/src/app/organizer/tournaments/[id]/station/station-board.tsx"
git commit -m "feat(design): station kiosk shell (realtime + fullscreen)"
```

## Task 3: Station page (staff-gated, playable matches + ConfirmForm)

**Files:** Create `web/src/app/organizer/tournaments/[id]/station/page.tsx`.

Mirror the staff guard + match/report loading of `web/src/app/organizer/tournaments/[id]/matches/page.tsx` (read it first), but render only the **playable** matches as big station cards, each embedding the existing `ConfirmForm` prefilled with the agreed player-reported score (if any).

- [ ] **Step 1: Write the page.**

```tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ConfirmForm } from "@/components/../app/organizer/tournaments/[id]/matches/confirm-form";
import { createClient } from "@/lib/supabase/server";
import { agreedScore, isPlayable, type Report } from "@/lib/station/station";

import { StationBoard } from "./station-board";

export const metadata: Metadata = { title: "Station — Turnier-App" };

type RawMatch = {
  id: string;
  status: string;
  participant_a_id: string | null;
  participant_b_id: string | null;
  a: { display_name: string } | null;
  b: { display_name: string } | null;
};
type RawReport = { match_id: string; score_a: number; score_b: number };

export default async function StationPage({
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
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!tournament) notFound();

  const { data: rawMatches } = await supabase
    .from("matches")
    .select(
      "id, status, participant_a_id, participant_b_id, " +
        "a:participant_a_id(display_name), b:participant_b_id(display_name)",
    )
    .eq("tournament_id", id)
    .order("round", { ascending: true })
    .order("slot", { ascending: true })
    .overrideTypes<RawMatch[]>();

  const playable = (rawMatches ?? []).filter((m) =>
    isPlayable({
      status: m.status,
      participantAId: m.participant_a_id,
      participantBId: m.participant_b_id,
    }),
  );

  // Agreed player reports → prefill the entry. One round-trip for all playable.
  const ids = playable.map((m) => m.id);
  let reportsByMatch = new Map<string, Report[]>();
  if (ids.length > 0) {
    const { data: reps } = await supabase
      .from("match_reports")
      .select("match_id, score_a, score_b")
      .in("match_id", ids)
      .overrideTypes<RawReport[]>();
    for (const r of reps ?? []) {
      const list = reportsByMatch.get(r.match_id) ?? [];
      list.push({ scoreA: r.score_a, scoreB: r.score_b });
      reportsByMatch.set(r.match_id, list);
    }
  }

  return (
    <StationBoard tournamentId={id}>
      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-8 sm:px-10">
        <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
          {tournament.name}
        </h1>
        <p className="mb-8 font-display text-xs uppercase tracking-[0.14em] text-fg-dim">
          Tippe das Ergebnis und gib es frei.
        </p>

        {playable.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface px-6 py-10 text-center font-display text-lg text-fg-muted">
            Keine spielbaren Matches gerade.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {playable.map((m) => {
              const agreed = agreedScore(reportsByMatch.get(m.id) ?? []);
              return (
                <div
                  key={m.id}
                  className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex-1 truncate text-right font-display text-lg font-semibold text-ink">
                      {m.a?.display_name ?? "TBD"}
                    </span>
                    <span className="font-display text-sm text-fg-dim">vs</span>
                    <span className="flex-1 truncate font-display text-lg font-semibold text-ink">
                      {m.b?.display_name ?? "TBD"}
                    </span>
                  </div>
                  <ConfirmForm
                    matchId={m.id}
                    aName={m.a?.display_name ?? "A"}
                    bName={m.b?.display_name ?? "B"}
                    defaultScoreA={agreed?.scoreA ?? null}
                    defaultScoreB={agreed?.scoreB ?? null}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StationBoard>
  );
}
```

> The `ConfirmForm` import path must resolve to `web/src/app/organizer/tournaments/[id]/matches/confirm-form.tsx`. Use whatever import style the codebase prefers (a relative path `../matches/confirm-form` is cleanest from the sibling `station/` dir). Adjust the import line accordingly — do NOT use the placeholder path shown above if it doesn't resolve; the relative `../matches/confirm-form` is correct.

- [ ] **Step 2: Build.** Run: `cd web && npm run build` → PASS.
- [ ] **Step 3: Commit.**

```bash
git add "web/src/app/organizer/tournaments/[id]/station/page.tsx"
git commit -m "feat(design): result-station page (playable matches + confirm)"
```

## Task 4: Wire the "Stationen" tab

**Files:** Modify `web/src/components/brand/tournament-tabs.tsx`.

- [ ] **Step 1: Activate the tab.** Change the `Stationen` entry's `segment` from `null` to `"station"` so it links to the new route:

```ts
  { label: "Stationen", segment: "station" },
```

Also update the component's JSDoc: `Stationen` is no longer a not-yet-built placeholder (only `Übersicht` remains a placeholder).

- [ ] **Step 2: Build.** Run: `cd web && npm run build` → PASS.
- [ ] **Step 3: Commit.**

```bash
git add web/src/components/brand/tournament-tabs.tsx
git commit -m "feat: link the Stationen tab to the result-station route"
```

## Task 5: e2e + docs

**Files:**
- Create: `web/e2e/result-station.spec.ts`
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Write the e2e.** Mirror the fixture setup in `web/e2e/swiss.spec.ts` (read it first): `beforeAll` creates a tournament (any elimination format, e.g. `single_elim`), registers + checks in a few solo adults, has the organizer generate the bracket so there is at least one playable round-1 match; `afterAll` deletes it. The test:
  - Organizer opens `/organizer/tournaments/${id}/station`.
  - Asserts the station header ("Station · Ergebnis-Eingabe") and at least one playable match card are visible.
  - Enters a score for one match (fill the two score inputs) and clicks "Freigeben".
  - Asserts that match card is removed from the station (the confirmed match is no longer playable).

```ts
// web/e2e/result-station.spec.ts — structure (fill fixtures by mirroring swiss.spec.ts)
import { expect, test } from "@playwright/test";
// ...same imports/fixture helpers as swiss.spec.ts (4 checked-in adults, single_elim)...

test.describe("Result station", () => {
  // beforeAll: create single_elim tournament + 4 checked-in adults; organizer generates the bracket
  // afterAll: delete the fixture tournament

  test("enters and confirms a result at the station", async ({ page }) => {
    await page.goto(`/organizer/tournaments/${tournamentId}/station`);
    await expect(page.getByText(/Station · Ergebnis-Eingabe/)).toBeVisible();
    const cards = page.locator(".grid > div"); // station match cards
    const before = await cards.count();
    expect(before).toBeGreaterThan(0);

    // fill the first card's two score inputs and confirm
    const firstCard = cards.first();
    const inputs = firstCard.locator('input[type="number"]');
    await inputs.nth(0).fill("2");
    await inputs.nth(1).fill("0");
    await firstCard.getByRole("button", { name: /Freigeben/ }).click();

    // the confirmed match drops off (realtime/refresh) -> fewer cards
    await expect(async () => {
      expect(await cards.count()).toBeLessThan(before);
    }).toPass();
  });
});
```

- [ ] **Step 2: Run the e2e.** Run: `cd web && npx playwright test e2e/result-station.spec.ts` → PASS. If the sandbox can't run a browser/dev-server, write the spec correctly and note the run is deferred — build + unit tests MUST be green.

- [ ] **Step 3: Update `docs/DEPLOY.md`.** Append a "Plan 11 — Result Stations" note: **no migration**; the organizer "Stationen" tab opens a fullscreen kiosk at `/organizer/tournaments/<id>/station` listing playable matches for direct referee score entry via the existing `confirm_match` flow; realtime keeps stations + the board in sync; staff-gated like the other organizer pages.

- [ ] **Step 4: Full verification.** Run: `cd web && npm run build && npm test && npx playwright test` → build clean; all unit tests green (incl. the new station test); e2e green (or deferred with reason).

- [ ] **Step 5: Commit.**

```bash
git add web/e2e/result-station.spec.ts docs/DEPLOY.md
git commit -m "feat: result-station e2e + docs"
```

---

## Self-Review

- **Spec coverage:** result-station kiosk (Task 2/3), playable-match listing (Task 1/3), direct referee score entry + confirm via the existing `confirm_match` (Task 3 reuses `ConfirmForm`), agreed-report prefill (Task 1/3), realtime sync across stations + board (Task 2), the "Stationen" tab wired (Task 4), e2e + docs (Task 5). **No migration.**
- **Security:** the station page enforces the same staff guard (`admin`/`organizer`/`referee`) as the matches page; `confirm_match` is itself staff-gated (defense in depth via RLS + the RPC's `is_staff()` check); no anon/public path reaches the station; no new PII surface (only `display_name` + scores, same as the matches page).
- **Correctness:** the playability + agreed-score helpers are pure and unit-tested; the kiosk shell reuses the production-proven board realtime pattern (Strict-Mode guard + best-effort subscribe); confirmed matches leave the list because they are no longer `isPlayable`, surfaced via `router.refresh()`.
- **Type consistency:** `isPlayable`/`agreedScore`/`StationMatch`/`Report` (station.ts), `StationBoard` (station-board.tsx), the reused `ConfirmForm` props — used consistently.

## Done = all true
- The "Stationen" organizer tab opens a fullscreen, realtime result-station kiosk listing playable matches; a referee enters a score and frees it via `confirm_match`; the confirmed match drops off and stations + board stay in sync; playability/prefill helpers unit-tested; **no migration required**; build + unit tests + e2e green.
