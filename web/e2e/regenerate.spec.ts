// Regenerate-Riegel (§7.17 HANDOVER): "Bracket neu generieren" is the only
// place where a wrong click destroys data irreversibly. Two layers guard it,
// and each gets its own test:
//
//  1. The SERVER guard in generateBracket ("the lock"): refuses without
//     discardResults when done/live/reported work exists. On a freshly loaded
//     page it is unreachable — the button derives discardResults from the
//     server-rendered counts. It only fires on a STALE page: work appears
//     while the page is open. That race is exactly what it was built for.
//  2. The warn dialog ("the courtesy"): a fresh page with lost work shows the
//     lostWork() wording inline and in the dialog; cancel preserves, confirm
//     really deletes.
//
// Cheapest lost-work sort: a pending match with ONE match_report — a single
// RPC from a participant client, no confirm needed (report_match never touches
// matches.status).
import { test, expect } from "@playwright/test";
import {
  getSingleFinal,
  hasOrgCreds,
  loginAsOrganizer,
  registerAndCheckIn,
  staffClient,
  withFixtureTournament,
  type FixtureParticipant,
} from "./fixtures";

test.skip(!hasOrgCreds, "organizer creds not configured");
const tournamentId = withFixtureTournament({ namePrefix: "E2E Regenerate" });

let p1: FixtureParticipant;
let firstMatchId = "";

test.beforeAll(async () => {
  p1 = await registerAndCheckIn(tournamentId(), "E2E Regen Anna");
  await registerAndCheckIn(tournamentId(), "E2E Regen Ben");
});

test("stale page: the server action refuses without explicit discard", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${tournamentId()}/bracket`);

  // Generate the bracket through the UI (the established chain).
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();
  await expect(page.getByTestId("bracket-view")).toBeVisible();

  const staff = await staffClient();
  const final = await getSingleFinal(staff, tournamentId());
  firstMatchId = final.id;

  // The race: a player report lands WHILE the page stays open. The page still
  // believes there is nothing to lose, so confirming sends discardResults:false.
  const { error: reportErr } = await p1.client.rpc("report_match", {
    p_match_id: final.id,
    p_score_a: 2,
    p_score_b: 1,
  });
  expect(reportErr).toBeNull();

  await page.getByRole("button", { name: /^neu generieren$/i }).click();
  // Stale page → the mild dialog (it does not know about the report yet).
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^neu generieren$/i }).click();

  // The lock: server counted the report and refused. Error text, no deletion.
  await expect(page.getByText(/bitte ausdrücklich bestätigen/i)).toBeVisible();

  const after = await getSingleFinal(staff, tournamentId());
  expect(after.id).toBe(firstMatchId);
  const { count } = await staff
    .from("match_reports")
    .select("id", { count: "exact", head: true })
    .eq("match_id", firstMatchId);
  expect(count).toBe(1);
});

test("fresh page: warn dialog names the loss, cancel preserves, confirm deletes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${tournamentId()}/bracket`);

  // Fresh render knows the counts: the lostWork() wording shows inline
  // before any click.
  await expect(
    page.getByText(/1 gemeldetes Ergebnis ohne Freigabe/i).first(),
  ).toBeVisible();

  // Open the dialog, then cancel — nothing may change.
  await page.getByRole("button", { name: /^neu generieren$/i }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/unwiderruflich gelöscht/i)).toBeVisible();
  await dialog.getByRole("button", { name: /abbrechen/i }).click();
  await expect(dialog).toBeHidden();

  const staff = await staffClient();
  const unchanged = await getSingleFinal(staff, tournamentId());
  expect(unchanged.id).toBe(firstMatchId);

  // Open again and confirm — now the page knows the loss, sends
  // discardResults:true, and the deletion is real.
  await page.getByRole("button", { name: /^neu generieren$/i }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^neu generieren$/i }).click();

  // New bracket: different match id, old reports gone via cascade.
  await expect
    .poll(async () => (await getSingleFinal(staff, tournamentId())).id, {
      timeout: 15_000,
    })
    .not.toBe(firstMatchId);
  const { count } = await staff
    .from("match_reports")
    .select("id", { count: "exact", head: true })
    .eq("match_id", firstMatchId);
  expect(count).toBe(0);
});
