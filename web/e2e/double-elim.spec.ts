// End-to-end double elimination (Plan 7) against the live hosted Supabase:
// an organizer generates + views a 4-entrant double-elim bracket (Winner Bracket,
// Loser Bracket, Grand Final) on the bracket page and the public board, and
// confirming a winner-bracket result drops the loser into the loser bracket.
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
 * create/seed/delete the fixture tournament and to confirm the result.
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

// Create a throwaway double-elim fixture tournament with 4 checked-in players.
test.beforeAll(async () => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const staff = await staffClient();
  const gameId = await getValorantGameId(staff);

  const name = `DE Test ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { data: t, error: tErr } = await staff
    .from("tournaments")
    .insert({
      name,
      game_id: gameId,
      format: "double_elim",
      mode: "hybrid",
      status: "registration",
    })
    .select("id")
    .single();
  if (tErr || !t) {
    throw new Error(`fixture tournament insert failed: ${tErr?.message ?? "none"}`);
  }
  fixtureId = t.id as string;

  // 4 checked-in participants (power-of-two → a clean 6-match DE bracket).
  for (let i = 1; i <= 4; i++) {
    await registerAndCheckIn(fixtureId, `DE-P${i}`);
  }
});

// Always remove the fixture so nothing leaks into the shared backend; the
// delete cascades to participants / matches / consents.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("organizer generates and views a double-elim bracket (WB / LB / GF)", async ({
  page,
}) => {
  const id = fixtureId;

  // (1) Organizer seeds + generates the double-elim bracket.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();

  // (2) The double-elim view renders all three section headings.
  const deView = page.getByTestId("double-elim-view");
  await expect(deView).toBeVisible();
  await expect(
    deView.getByRole("heading", { name: /^winner bracket$/i }),
  ).toBeVisible();
  await expect(
    deView.getByRole("heading", { name: /^loser bracket$/i }),
  ).toBeVisible();
  await expect(
    deView.getByRole("heading", { name: /^grand final$/i }),
  ).toBeVisible();

  // N=4 double-elim = 6 matches (WB 3 + LB 2 + GF 1); each renders one card with
  // two named rows. The match cards are the bordered containers holding the rows.
  const cardCount = await deView
    .locator("div.rounded-\\[10px\\].border")
    .count();
  expect(cardCount).toBe(6);

  // (3) The public board renders the same three sections (login-free, anon RLS).
  await page.goto(`/t/${id}/board`);
  const boardView = page.getByTestId("double-elim-view");
  await expect(boardView).toBeVisible();
  await expect(
    boardView.getByRole("heading", { name: /^winner bracket$/i }),
  ).toBeVisible();
  await expect(
    boardView.getByRole("heading", { name: /^loser bracket$/i }),
  ).toBeVisible();
  await expect(
    boardView.getByRole("heading", { name: /^grand final$/i }),
  ).toBeVisible();
});

test("confirming a WB result drops the loser into the loser bracket", async () => {
  const staff = await staffClient();
  const id = fixtureId;

  // The bracket was generated by the previous test. Read the matches and pick a
  // WB round-1 match with both slots filled and a loser-drop link.
  const { data: matches, error } = await staff
    .from("matches")
    .select(
      "id, bracket, round, slot, participant_a_id, participant_b_id, " +
        "loser_next_match_id, loser_next_slot",
    )
    .eq("tournament_id", id);
  if (error) throw new Error(`could not load matches: ${error.message}`);

  const wbR1 = (matches ?? []).find(
    (m) =>
      m.bracket === "winner" &&
      m.round === 1 &&
      m.participant_a_id != null &&
      m.participant_b_id != null &&
      m.loser_next_match_id != null,
  );
  expect(
    wbR1,
    "a WB round-1 match with both players and a loser_next_match_id must exist",
  ).toBeTruthy();

  // Sanity: the loser-drop link must be wired (Plan 7 generation step 3b). If
  // this is null the generator/action did not persist the loser link.
  expect(
    wbR1!.loser_next_match_id,
    "WB R1 match must carry loser_next_match_id (loser-drop link)",
  ).toBeTruthy();
  expect(["a", "b"]).toContain(wbR1!.loser_next_slot);

  // Side A wins 2:1 → participant_b is the loser and should drop into the LB.
  const expectedLoser = wbR1!.participant_b_id as string;
  const targetMatchId = wbR1!.loser_next_match_id as string;
  const targetSlot = wbR1!.loser_next_slot as "a" | "b";

  const { error: confirmErr } = await staff.rpc("confirm_match", {
    p_match_id: wbR1!.id,
    p_score_a: 2,
    p_score_b: 1,
  });
  if (confirmErr) {
    throw new Error(`confirm_match failed: ${confirmErr.message}`);
  }

  // Re-read the loser-target match; the loser must now occupy loser_next_slot.
  const { data: target, error: targetErr } = await staff
    .from("matches")
    .select("participant_a_id, participant_b_id")
    .eq("id", targetMatchId)
    .single();
  if (targetErr || !target) {
    throw new Error(`could not re-read loser target: ${targetErr?.message}`);
  }

  const occupant =
    targetSlot === "a" ? target.participant_a_id : target.participant_b_id;

  // If this fails with occupant == null, confirm_match did not drop the loser →
  // the loser-drop migration (20260622093000) is not applied to the live DB.
  expect(
    occupant,
    "confirm_match loser-drop migration (20260622093000) not applied — loser slot stayed empty",
  ).toBe(expectedLoser);
});
