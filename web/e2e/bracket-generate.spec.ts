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
import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  expectSupabaseEnv,
  staffClient,
  loginAsOrganizer,
  registerAndCheckIn,
  createFixtureTournament,
} from "./fixtures";

// Seeding + generation require a staff session. Skip cleanly when organizer
// creds are not configured (mirrors the other organizer specs).
test.skip(!hasOrgCreds, "organizer creds not configured");

let fixtureId = "";
const playerNames: string[] = [];

// Create a throwaway single_elim fixture tournament with 2 checked-in players.
// N=2 (power-of-two, no byes) → a single final with both entrants visible, the
// smallest bracket that proves the seed/generate UI renders the players.
test.beforeAll(async () => {
  expectSupabaseEnv();

  const staff = await staffClient();
  fixtureId = await createFixtureTournament(staff, {
    format: "single_elim",
    namePrefix: "Bracket Gen Test",
  });

  // 2 checked-in participants with unique names we can assert in the bracket.
  for (let i = 1; i <= 2; i++) {
    const display = `BG-P${i} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const participant = await registerAndCheckIn(fixtureId, display);
    playerNames.push(participant.displayName);
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
  // N=2 single_elim has no byes and exactly one final, so each name appears once;
  // `.first()` is purely defensive against incidental duplicate text in the view.
  const bracket = page.getByTestId("bracket-view");
  await expect(bracket).toBeVisible();
  for (const name of playerNames) {
    await expect(
      bracket.getByText(name, { exact: false }).first(),
    ).toBeVisible();
  }
});
