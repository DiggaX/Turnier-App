// End-to-end single-elim bracket generation (Plan 7) against the live hosted
// Supabase: an organizer seeds + generates a single-elim bracket from the
// /organizer bracket UI and the generated bracket renders with the entrants.
//
// This spec is fully self-contained: it creates a throwaway fixture tournament
// (unique name, format='single_elim') with 2 programmatically registered +
// checked-in participants in `beforeAll`, drives the UI seed/generate buttons,
// and deletes the fixture in `afterAll` (cascades to participants / matches /
// consents). It never touches the shared seeded "Sommer Cup 2026", so it is
// order-independent relative to the other specs and leaks no state.
//
// Participants are set up programmatically (not via browser flows): the live
// backend rate-limits anonymous sign-ins per IP, and browser registrations would
// be slow + flaky. Each participant gets its own anon supabase-js client (its own
// auth user) so the owner-scoped insert/consent/check_in RLS is satisfied exactly
// as the real participant flow does it. N=2 → a single final with both entrants,
// the smallest bracket that proves the seed/generate UI renders the players.
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ORG_EMAIL = process.env.E2E_ORG_EMAIL;
const ORG_PASSWORD = process.env.E2E_ORG_PASSWORD;

// Seeding + generation require a staff session. Skip cleanly when organizer
// creds are not configured (mirrors the other organizer specs).
test.skip(!ORG_EMAIL || !ORG_PASSWORD, "organizer creds not configured");

/**
 * Sign in as the organizer and return a staff-scoped Supabase client. Used to
 * create/delete the fixture tournament.
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

/** Resolve the organizer's org_id — staff write RLS requires org_id = current_org_id(). */
async function getOrgId(client: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data, error } = await client
    .from("profiles")
    .select("org_id")
    .eq("id", user?.id ?? "")
    .single();
  if (error || !data?.org_id) {
    throw new Error(`Could not resolve org_id: ${error?.message ?? "none"}`);
  }
  return data.org_id as string;
}

/**
 * Register a fresh anonymous solo adult participant for the fixture tournament
 * using its own anon client (its own auth user), then check them in online.
 * Mirrors the real participant flow's DB writes: participant row → consent row →
 * `check_in('online')` RPC. Returns the chosen display name (asserted in the UI).
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

  return displayName;
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
const playerNames: string[] = [];

// Create a throwaway single_elim fixture tournament with 2 checked-in players.
// N=2 (power-of-two, no byes) → a single final with both entrants visible, the
// smallest bracket that proves the seed/generate UI renders the players.
test.beforeAll(async () => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const staff = await staffClient();
  const gameId = await getValorantGameId(staff);
  const orgId = await getOrgId(staff);

  const name = `Bracket Gen Test ${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}`;
  const { data: t, error: tErr } = await staff
    .from("tournaments")
    .insert({
      name,
      game_id: gameId,
      org_id: orgId,
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

  // 2 checked-in participants with unique names we can assert in the bracket.
  for (let i = 1; i <= 2; i++) {
    const display = `BG-P${i} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    playerNames.push(await registerAndCheckIn(fixtureId, display));
  }
});

// Always remove the fixture so nothing leaks into the shared backend; the
// delete cascades to participants / matches / consents.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("organizer seeds and generates a single-elim bracket from checked-in players", async ({
  page,
}) => {
  const id = fixtureId;

  // (1) Log in as organizer and open the bracket page (default `page` context).
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);

  // (2) No matches exist yet (fresh fixture) → the seeding editor shows. Seed
  // randomly, save, then generate via the same UI buttons the other specs use.
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();

  // (3) The generated bracket renders, and both registered players appear in it.
  // A player who wins a round-1 bye is rendered both in round 1 and in the round
  // they advance into, so a name can match more than once — assert the first.
  const bracket = page.getByTestId("bracket-view");
  await expect(bracket).toBeVisible();
  for (const name of playerNames) {
    await expect(
      bracket.getByText(name, { exact: false }).first(),
    ).toBeVisible();
  }
});
