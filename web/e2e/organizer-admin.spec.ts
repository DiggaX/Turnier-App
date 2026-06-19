// End-to-end Organizer-Admin (Modul 1) against the live hosted Supabase:
// the organizer adds a game, creates a tournament from /organizer/tournaments/new,
// opens registration via the lifecycle controls, then visits the public register
// page and asserts it renders (proves registration is open).
//
// This spec is fully self-contained: it creates a throwaway fixture game "E2E Game"
// (skips creation if it already exists) and a uniquely-named tournament in `beforeAll`,
// then deletes them in `afterAll` via the staff client (cascades to matches/participants/
// consents). It never touches the shared seeded "Sommer Cup 2026".
//
// The game add step goes through the UI on /organizer/games.
// The tournament creation step goes through the UI on /organizer/tournaments/new.
// The status advance step is done via the LifecycleControls button on the overview page.
import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  expectSupabaseEnv,
  staffClient,
  loginAsOrganizer,
} from "./fixtures";

// All actions require a staff session. Skip cleanly when organizer creds are
// not configured (mirrors the other organizer specs).
test.skip(!hasOrgCreds, "organizer creds not configured");

const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const FIXTURE_GAME_NAME = "E2E Game";
const FIXTURE_TOURNAMENT_NAME = `E2E Admin ${uniqueSuffix}`;

let fixtureId = "";
let createdGameId = "";

test.describe("Organizer admin", () => {
  test.beforeAll(async () => {
    expectSupabaseEnv();
  });

  test.afterAll(async () => {
    const staff = await staffClient();
    // Delete the created tournament (cascades to participants / matches / consents).
    if (fixtureId) {
      await staff.from("tournaments").delete().eq("id", fixtureId);
    }
    // Delete the game only if we created it (skip if it pre-existed).
    if (createdGameId) {
      await staff.from("games").delete().eq("id", createdGameId);
    }
  });

  test("create tournament, open registration, register page reachable", async ({
    page,
  }) => {
    await loginAsOrganizer(page);

    // ── Step 1: Go to /organizer/games and add "E2E Game" (team size 1) ──────
    await page.goto("/organizer/games");

    // Only add if the game does not already exist in the list.
    // exact:true prevents a partial match against e.g. "E2E Game (old)" which
    // would set gameAlreadyExists=true and later cause selectOption to fail.
    const existingRow = page.getByRole("cell", { name: FIXTURE_GAME_NAME, exact: true });
    const gameAlreadyExists = await existingRow.count().then((c) => c > 0);

    if (!gameAlreadyExists) {
      // Fill the "add game" row at the bottom of the games table.
      await page
        .getByLabel("Name des neuen Spiels")
        .fill(FIXTURE_GAME_NAME);
      // team_size defaults to 1 in the AddGameRow, so no change needed.
      await page.getByRole("button", { name: /hinzufügen/i }).click();

      // Wait for the new row to appear — indicates the server action succeeded
      // and router.refresh() has repopulated the list.
      await expect(
        page.getByRole("cell", { name: FIXTURE_GAME_NAME, exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // Record the game id for cleanup via the staff client.
      const staff = await staffClient();
      const { data: g } = await staff
        .from("games")
        .select("id")
        .eq("name", FIXTURE_GAME_NAME)
        .maybeSingle();
      if (g) createdGameId = g.id as string;
    }

    // ── Step 2: Create the tournament via /organizer/tournaments/new ──────────
    await page.goto("/organizer/tournaments/new");
    await expect(page.getByRole("heading", { name: /neues turnier/i })).toBeVisible();

    await page.getByLabel("Name").fill(FIXTURE_TOURNAMENT_NAME);

    // Select the game from the dropdown.
    await page.getByLabel("Spiel").selectOption({ label: FIXTURE_GAME_NAME });

    // Format: keep default (single_elim) or explicitly set it.
    await page.getByLabel("Format").selectOption("single_elim");

    // Mode: keep default (hybrid).
    await page.getByLabel("Modus").selectOption("hybrid");

    // Team size is seeded from the game (1); leave as-is.
    // Leave "Start" empty — it's optional.

    await page.getByRole("button", { name: /turnier anlegen/i }).click();

    // After a successful create the server action redirects to the overview at
    // /organizer/tournaments/<uuid>. Require the uuid segment explicitly: the
    // looser /[^/]+$/ also matches the form URL .../tournaments/new, so it would
    // pass *before* the redirect and capture "new" as the id — sending the later
    // register-page check to /t/new/register (404) and leaking the real fixture.
    await expect(page).toHaveURL(
      /\/organizer\/tournaments\/[0-9a-f-]{36}$/,
      { timeout: 15_000 },
    );

    // Capture the tournament id from the URL for cleanup.
    // Fail fast with a descriptive message if the URL format is unexpected —
    // a null match would leave fixtureId empty, silently skip afterAll cleanup,
    // and potentially leak the fixture tournament into subsequent specs.
    const url = page.url();
    const match = url.match(/\/organizer\/tournaments\/([0-9a-f-]{36})$/);
    expect(match, `redirect URL did not match expected pattern — got: ${url}`).not.toBeNull();
    fixtureId = match![1];
    expect(fixtureId, "tournament id must be captured from redirect URL").toBeTruthy();

    // The overview page should show the tournament name and a "draft" status.
    // Use a text locator rather than role-heading because the h1 applies CSS
    // `uppercase` which does not affect the underlying text content, but
    // role-heading name matching may vary by browser/accessibility-tree impl.
    await expect(page.getByText(FIXTURE_TOURNAMENT_NAME, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 3: Advance from "draft" to "registration" ────────────────────────
    // The LifecycleControls renders "Anmeldung öffnen" for the draft→registration step.
    const openBtn = page.getByRole("button", { name: /anmeldung öffnen/i });
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    // After the server action the status badge should update to "Anmeldung offen".
    await expect(
      page.getByText(/anmeldung offen/i, { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Visit the public register page and assert it renders ──────────
    await page.goto(`/t/${fixtureId}/register`);
    // The register-client shows a heading "Anmeldung" when the tournament is in
    // registration status; a 404 would leave the page without it.
    await expect(
      page.getByRole("heading", { name: /anmeldung/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
