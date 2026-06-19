// Public live board (/t/<id>/board) against the live hosted Supabase:
// an organizer seeds + generates a 2-entrant single-elim final (both slots
// filled) for a throwaway fixture tournament → open the PUBLIC board (no login)
// and assert the bracket, the running status pill, and both participant names
// render → confirm the result with the organizer supabase-js client
// (confirm_match, 2:1) → reload the board and assert the score "2:1" shows.
//
// Self-contained: `beforeAll` creates a throwaway fixture tournament (unique
// name, format='single_elim') with 2 programmatically registered + checked-in
// participants, runs the public-board assertions, and `afterAll` deletes the
// tournament (cascades to participants / matches / consents). It never touches
// any pre-existing tournament, so it is order-independent.
//
// The realtime subscription (LiveBoard) is best-effort — it pushes a
// router.refresh() when realtime is enabled — but the explicit page.reload()
// below deterministically proves the public data path regardless.
import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  expectSupabaseEnv,
  staffClient,
  loginAsOrganizer,
  registerAndCheckIn,
  createFixtureTournament,
  getSingleFinal,
} from "./fixtures";

// Seeding/generating and confirming the result need a staff session.
test.skip(!hasOrgCreds, "organizer creds not configured");

let fixtureId = "";
// The names actually registered in beforeAll — the single source of truth for
// the board name assertions (no hardcoded duplicate of the name template).
const playerNames: string[] = [];

// Create a throwaway single_elim fixture with two checked-in players → seeding +
// generation produces a single 2-entrant final (both slots filled).
test.beforeAll(async () => {
  expectSupabaseEnv();
  const staff = await staffClient();
  fixtureId = await createFixtureTournament(staff, {
    format: "single_elim",
    namePrefix: "Board Test",
  });
  for (let i = 1; i <= 2; i++) {
    const p = await registerAndCheckIn(fixtureId, `Board-P${i}`);
    playerNames.push(p.displayName);
  }
});

// Always remove the fixture so nothing leaks; the delete cascades to
// participants / matches / consents.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("public live board renders the bracket and reflects confirmed results", async ({
  browser,
  page,
}) => {
  const id = fixtureId;

  // (1) Organizer seeds + generates the bracket (1 final, both slots filled) in
  // the default `page` context.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();
  await expect(page.getByTestId("bracket-view")).toBeVisible();

  // (2) Open the PUBLIC board in a fresh anonymous context — no login needed.
  const publicCtx = await browser.newContext();
  const board = await publicCtx.newPage();
  const staff = await staffClient();
  try {
    await board.goto(`/t/${id}/board`);

    // The bracket structure renders for the anon visitor (no login).
    await expect(board.getByTestId("bracket-view")).toBeVisible();

    // Status pill (tournament flips to `running` on generate), backed by the
    // public-read `tournaments` table.
    await expect(board.getByText(/läuft/i).first()).toBeVisible();

    // Both participant names render on the public board — the
    // `20260621093000_board_participants_public` migration (public-board SELECT
    // policy + safe column grant) is applied, so this is an unconditional
    // regression guard, not a best-effort probe.
    for (const name of playerNames) {
      await expect(board.getByText(name, { exact: false }).first()).toBeVisible();
    }

    // (3) Confirm the result with the organizer client (2:1, side A wins), then
    // reload the board and assert the score is reflected. Realtime is
    // best-effort; the reload guarantees the data path.
    const finalMatch = await getSingleFinal(staff, id);
    const { error: confirmErr } = await staff.rpc("confirm_match", {
      p_match_id: finalMatch.id,
      p_score_a: 2,
      p_score_b: 1,
    });
    expect(confirmErr, confirmErr?.message).toBeNull();

    await board.reload();

    // The decided match surfaces its final score in the board's "Ergebnisse"
    // section. The score cell carries an aria-label "2:1" (the digits live in
    // separate colored spans), so match on the accessible label.
    await expect(board.getByLabel("2:1").first()).toBeVisible();
  } finally {
    await publicCtx.close();
  }
});
