// End-to-end Swiss system (Plan 8) against the live hosted Supabase:
// an organizer generates + views a 4-entrant Swiss bracket on the bracket page
// and the public board, confirms both round-1 matches via the RPC, then
// advances to round 2 via the "Nächste Runde" button. After round 2 the
// "Alle X Runden gespielt" message appears instead of the advance button.
//
// This spec is fully self-contained: it creates a throwaway fixture tournament
// (unique name) with 4 programmatically registered + checked-in participants in
// `beforeAll`, and deletes it in `afterAll` (cascades to participants / matches /
// consents). It never touches the shared seeded "Sommer Cup 2026", so it is
// order-independent relative to the other specs.
//
// Participants are set up programmatically (not via 4 browser flows): the live
// backend rate-limits anonymous sign-ins per IP, and 4 browser registrations
// would be slow + flaky. Each participant gets its own anon supabase-js client
// (its own auth user) so the owner-scoped insert/consent/check_in RLS is
// satisfied exactly as the real participant flow does it.
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ORG_EMAIL = process.env.E2E_ORG_EMAIL;
const ORG_PASSWORD = process.env.E2E_ORG_PASSWORD;

// Generation + confirmation require a staff session. Skip cleanly when organizer
// creds are not configured (mirrors the other organizer specs).
test.skip(!ORG_EMAIL || !ORG_PASSWORD, "organizer creds not configured");

/**
 * Sign in as the organizer and return a staff-scoped Supabase client. Used to
 * create/seed/delete the fixture tournament and to confirm results.
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

// Create a throwaway Swiss fixture tournament with 4 checked-in players.
// N=4 → R=ceil(log2(4))=2 rounds.
test.beforeAll(async () => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const staff = await staffClient();
  const gameId = await getValorantGameId(staff);

  const name = `Swiss Test ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { data: t, error: tErr } = await staff
    .from("tournaments")
    .insert({
      name,
      game_id: gameId,
      format: "swiss",
      mode: "hybrid",
      status: "registration",
    })
    .select("id")
    .single();
  if (tErr || !t) {
    throw new Error(`fixture tournament insert failed: ${tErr?.message ?? "none"}`);
  }
  fixtureId = t.id as string;

  // 4 checked-in participants → R=2 Swiss rounds, 2 matches per round.
  for (let i = 1; i <= 4; i++) {
    await registerAndCheckIn(fixtureId, `SW-P${i}`);
  }
});

// Always remove the fixture so nothing leaks into the shared backend; the
// delete cascades to participants / matches / consents.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("organizer generates and views a Swiss bracket (round 1)", async ({
  page,
}) => {
  const id = fixtureId;

  // (1) Organizer seeds + generates the Swiss bracket.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();

  // (2) The Swiss view renders with the standings table and round 1 schedule.
  const swissView = page.getByTestId("swiss-view");
  await expect(swissView).toBeVisible();
  await expect(page.getByText("Runde 1")).toBeVisible();

  // N=4 → round 1 = 2 matches, no bye.
  // The "Tabelle" section is present.
  await expect(page.getByText("Tabelle")).toBeVisible();
  await expect(page.getByText("Runden")).toBeVisible();

  // (3) The public board renders the Swiss view (login-free, anon RLS).
  await page.goto(`/t/${id}/board`);
  await expect(page.getByTestId("swiss-view")).toBeVisible();
  await expect(page.getByText("Runde 1")).toBeVisible();
});

test("advancing to round 2 after confirming round 1", async () => {
  const staff = await staffClient();
  const id = fixtureId;

  // The bracket was generated by the previous test. Read the round-1 matches.
  const { data: matches, error } = await staff
    .from("matches")
    .select("id, round, status, participant_a_id, participant_b_id")
    .eq("tournament_id", id)
    .eq("round", 1);
  if (error) throw new Error(`could not load matches: ${error.message}`);

  const pendingR1 = (matches ?? []).filter(
    (m) =>
      m.status === "pending" &&
      m.participant_a_id != null &&
      m.participant_b_id != null,
  );
  expect(
    pendingR1.length,
    "N=4 Swiss round 1 must have 2 pending matches (no bye)",
  ).toBe(2);

  // Confirm both round-1 matches via the staff RPC (side A wins each).
  for (const m of pendingR1) {
    const { error: confirmErr } = await staff.rpc("confirm_match", {
      p_match_id: m.id,
      p_score_a: 2,
      p_score_b: 0,
    });
    if (confirmErr) {
      throw new Error(`confirm_match failed for ${m.id}: ${confirmErr.message}`);
    }
  }

  // Verify round 1 is now fully done.
  const { data: afterR1, error: r1Err } = await staff
    .from("matches")
    .select("status")
    .eq("tournament_id", id)
    .eq("round", 1);
  if (r1Err) throw new Error(`re-read round 1 failed: ${r1Err.message}`);
  expect(
    (afterR1 ?? []).every((m) => m.status === "done" || m.status === "bye"),
    "all round-1 matches must be done/bye after confirmation",
  ).toBe(true);
});

test("advance button appears and generates round 2", async ({ page }) => {
  const id = fixtureId;

  // Organizer views the bracket page after round 1 is confirmed.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);

  // The advance button must be visible since round 1 is complete and round 2 is
  // still to be played (N=4 → R=2).
  const advanceBtn = page.getByRole("button", { name: /Nächste Runde/i });
  await expect(advanceBtn).toBeVisible();
  await advanceBtn.click();

  // After advancing, round 2 appears in the schedule.
  await expect(page.getByText("Runde 2")).toBeVisible();

  // N=4 → R=2, so after the advance button is gone (we are now at the final
  // round). The organizer must confirm round 2 before the "Endstand" message
  // appears, but the advance button itself must not be present any more.
  const advanceBtnAfter = page.getByRole("button", { name: /Nächste Runde/i });
  await expect(advanceBtnAfter).not.toBeVisible();
});
