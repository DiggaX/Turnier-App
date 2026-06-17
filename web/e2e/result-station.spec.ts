// End-to-end Result Station (Plan 11) against the live hosted Supabase:
// an organizer opens the result-station kiosk, sees playable round-1 match
// cards for a single_elim fixture tournament, enters a score, confirms it, and
// asserts the confirmed match drops off the station list.
//
// This spec is fully self-contained: it creates a throwaway fixture tournament
// (unique name, format='single_elim') with 4 programmatically registered +
// checked-in participants in `beforeAll`, seeds them, inserts round-1 matches
// programmatically via the staff API (avoids slow/flaky UI bracket generation),
// and verifies at least 2 pending round-1 matches exist;
// `afterAll` deletes the tournament (cascades to participants / matches /
// consents). It never touches the shared seeded "Sommer Cup 2026".
//
// Participants are set up programmatically (not via 4 browser flows): the live
// backend rate-limits anonymous sign-ins per IP, and 4 browser registrations
// would be slow + flaky. Each participant gets its own anon supabase-js client
// so the owner-scoped insert/consent/check_in RLS is satisfied exactly as the
// real participant flow does it.
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ORG_EMAIL = process.env.E2E_ORG_EMAIL;
const ORG_PASSWORD = process.env.E2E_ORG_PASSWORD;

// Station access + bracket generation require a staff session. Skip cleanly
// when organizer creds are not configured (mirrors the other organizer specs).
test.skip(!ORG_EMAIL || !ORG_PASSWORD, "organizer creds not configured");

/**
 * Sign in as the organizer and return a staff-scoped Supabase client. Used to
 * create/seed/delete the fixture tournament.
 */
async function staffClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({
    email: ORG_EMAIL!,
    password: ORG_PASSWORD!,
  });
  if (error) throw new Error(`organizer sign-in failed: ${error.message}`);
  return client;
}

/** Resolve the Valorant game id (the format/mode the fixture tournament uses). */
async function getValorantGameId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("games")
    .select("id")
    .eq("name", "Valorant")
    .single();
  if (error || !data) {
    throw new Error(`Could not load Valorant game: ${error?.message ?? "none"}`);
  }
  return data.id as string;
}

/**
 * Register a fresh anonymous solo adult participant for the fixture tournament
 * using its own anon client (its own auth user), then check them in online.
 * Mirrors the real participant flow's DB writes: participant row → consent row →
 * `check_in('online')` RPC. Returns the new participant id.
 */
async function registerAndCheckIn(
  tournamentId: string,
  displayName: string,
): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: auth, error: authErr } = await client.auth.signInAnonymously();
  if (authErr || !auth.user) {
    throw new Error(`anon sign-in failed: ${authErr?.message ?? "no user"}`);
  }

  const { data: part, error: partErr } = await client
    .from("participants")
    .insert({
      tournament_id: tournamentId,
      user_id: auth.user.id,
      type: "solo",
      display_name: displayName,
      birthdate: "2000-01-01",
    })
    .select("id")
    .single();
  if (partErr || !part) {
    throw new Error(`participant insert failed: ${partErr?.message ?? "none"}`);
  }
  const participantId = part.id as string;

  const { error: consentErr } = await client.from("consents").insert({
    participant_id: participantId,
    grantor: "self",
    grantor_name: displayName,
    method: "checkbox",
  });
  if (consentErr) {
    throw new Error(`consent insert failed: ${consentErr.message}`);
  }

  const { error: checkInErr } = await client.rpc("check_in", {
    p_participant_id: participantId,
    p_method: "online",
  });
  if (checkInErr) {
    throw new Error(`check_in failed for ${displayName}: ${checkInErr.message}`);
  }

  return participantId;
}

/** Log in as the organizer through the UI (default `page` context). */
async function loginAsOrganizer(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(ORG_EMAIL!);
  await page.getByLabel(/passwort|password/i).fill(ORG_PASSWORD!);
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await expect(page).toHaveURL(/\/organizer/);
}

let fixtureId = "";

test.describe("Result station", () => {
// Create a throwaway single_elim fixture tournament with 4 checked-in players,
// assign seeds, then insert two pending round-1 matches directly via the staff
// API. N=4 single_elim → seed 1 vs 4 (slot 0), seed 2 vs 3 (slot 1); both
// slots filled → both are immediately playable. A pending round-2 final (both
// sides null) is also inserted to complete a minimal bracket shape.
test.beforeAll(async () => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const staff = await staffClient();
  const gameId = await getValorantGameId(staff);

  const name = `Station Test ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { data: t, error: tErr } = await staff
    .from("tournaments")
    .insert({
      name,
      game_id: gameId,
      format: "single_elim",
      mode: "hybrid",
      status: "registration",
    })
    .select("id")
    .single();
  if (tErr || !t) {
    throw new Error(`fixture tournament insert failed: ${tErr?.message ?? "none"}`);
  }
  fixtureId = t.id as string;

  // 4 checked-in participants: ST-P1..ST-P4.
  const participantIds: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const id = await registerAndCheckIn(fixtureId, `ST-P${i}`);
    participantIds.push(id);
  }

  // Assign seeds 1-4 in registration order.
  for (let i = 0; i < participantIds.length; i++) {
    const { error: seedErr } = await staff
      .from("participants")
      .update({ seed: i + 1 })
      .eq("id", participantIds[i])
      .eq("tournament_id", fixtureId);
    if (seedErr) {
      throw new Error(`seed update failed: ${seedErr.message}`);
    }
  }

  // Standard single_elim seeding for 4 entrants (power-of-2, no byes):
  //   slot 0: seed 1 (P1) vs seed 4 (P4)
  //   slot 1: seed 2 (P2) vs seed 3 (P3)
  // Slot parity (0-based): slot 0 → a-side; slot 1 → b-side of the semifinal.
  // Round 2: one empty final waiting for the two winners.
  const [p1, p2, p3, p4] = participantIds;

  const { data: r1Rows, error: r1Err } = await staff
    .from("matches")
    .insert([
      {
        tournament_id: fixtureId,
        bracket: "winner",
        round: 1,
        slot: 0,
        participant_a_id: p1,
        participant_b_id: p4,
        winner_id: null,
        status: "pending",
      },
      {
        tournament_id: fixtureId,
        bracket: "winner",
        round: 1,
        slot: 1,
        participant_a_id: p2,
        participant_b_id: p3,
        winner_id: null,
        status: "pending",
      },
    ])
    .select("id, slot");
  if (r1Err || !r1Rows || r1Rows.length !== 2) {
    throw new Error(
      `round-1 match insert failed: ${r1Err?.message ?? "no rows"}`,
    );
  }

  // Insert the empty final (round 2) so the bracket shape is complete.
  await staff.from("matches").insert([
    {
      tournament_id: fixtureId,
      bracket: "winner",
      round: 2,
      slot: 0,
      participant_a_id: null,
      participant_b_id: null,
      winner_id: null,
      status: "pending",
    },
  ]);

  // Flip tournament to running so the station page's staff guard + tournament
  // query succeed (the status doesn't affect station logic but mirrors reality).
  await staff
    .from("tournaments")
    .update({ status: "running" })
    .eq("id", fixtureId);
});

// Always remove the fixture so nothing leaks into the shared backend; the
// delete cascades to participants / matches / consents.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("enters and confirms a result at the station", async ({ page }) => {
  const id = fixtureId;

  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/station`);

  // Station header is visible.
  await expect(page.getByText(/Station · Ergebnis-Eingabe/)).toBeVisible();

  // At least one playable match card must be shown (N=4 single_elim → 2
  // round-1 matches, both with slots filled).
  const cards = page.locator(".grid > div"); // station match cards
  await expect(cards.first()).toBeVisible({ timeout: 10000 });
  const before = await cards.count();
  expect(before).toBeGreaterThan(0);

  // Fill the first card's two score inputs and confirm.
  const firstCard = cards.first();
  const inputs = firstCard.locator('input[type="number"]');
  await inputs.nth(0).fill("2");
  await inputs.nth(1).fill("0");
  await firstCard.getByRole("button", { name: /Freigeben/ }).click();

  // The confirmed match drops off (realtime or page refresh triggers
  // router.refresh()) → the station shows fewer cards.
  await expect(async () => {
    expect(await cards.count()).toBeLessThan(before);
  }).toPass();
});
}); // end test.describe("Result station")
