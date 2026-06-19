// End-to-end results flow against the live hosted Supabase: a 2-entrant
// single-elim final where ONE player reports through the real participant /me
// report form (Dein Score / Gegner-Score → "Ergebnis melden") and the OTHER via
// the genuine `report_match` RPC; both agree, then the organizer confirms on the
// Matches tab and the match shows `done` with the correct winner.
//
// Self-contained: `beforeAll` creates a throwaway fixture tournament (unique
// name, format='single_elim') and one programmatically-registered + checked-in
// participant (its own anon supabase-js session). The browser-registered player
// is created in the test (its anon session lives in its own browser context, so
// it can drive the /me form). `afterAll` deletes the tournament (cascades to
// participants / matches / consents / match_reports). It never touches any
// pre-existing tournament, so it is order-independent.
//
// Coverage rationale: driving one report through the /me UI exercises the
// participant report form + the toMatchScores side-mapping in me-client.tsx; the
// other through the RPC keeps the anon sign-in count at the minimum (2 total, the
// live backend rate-limits anon sign-ins per IP). N=2 is the smallest set that
// yields a single final both players can report on.
import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  expectSupabaseEnv,
  staffClient,
  loginAsOrganizer,
  registerAndCheckIn,
  createFixtureTournament,
  getSingleFinal,
  type FixtureParticipant,
} from "./fixtures";

// The full results flow needs a staff session to seed/generate and to confirm.
test.skip(!hasOrgCreds, "organizer creds not configured");

let fixtureId = "";
// The RPC-reporting player, registered programmatically in beforeAll.
let rpcPlayer: FixtureParticipant;

// Create a throwaway single_elim fixture with one programmatic participant; the
// second (form-reporting) player is browser-registered in the test itself.
test.beforeAll(async () => {
  expectSupabaseEnv();
  const staff = await staffClient();
  fixtureId = await createFixtureTournament(staff, {
    format: "single_elim",
    namePrefix: "Results Test",
  });
  // RF-P2 reports via the report_match RPC from its own anon session.
  rpcPlayer = await registerAndCheckIn(fixtureId, "RF-P2");
});

// Always remove the fixture so nothing leaks; the delete cascades to
// participants / matches / consents / match_reports.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("a player reports via /me, the other via RPC, organizer confirms the winner", async ({
  browser,
  page,
}) => {
  const id = fixtureId;
  const staff = await staffClient();

  // (1) RF-P1 registers through the real browser flow (its anon session lands in
  // its own context so it can later drive /me), then checks in via /me.
  const formCtx = await browser.newContext();
  const formPage = await formCtx.newPage();
  try {
    await formPage.goto(`/t/${id}/register`);
    await formPage.getByLabel("Anzeigename").fill("RF-P1");
    await formPage.getByLabel("Geburtsdatum").fill("2000-01-01");
    const captain = formPage.getByLabel("Captain — Name");
    if (await captain.isVisible()) await captain.fill("RF-P1");
    await formPage
      .getByRole("button", { name: /weiter zur einwilligung/i })
      .click();
    await formPage
      .getByRole("checkbox", { name: /einwilligung erteilen/i })
      .click();
    await formPage.getByLabel("Name (zur Bestätigung)").fill("RF-P1");
    await formPage
      .getByRole("button", { name: /einwilligung abschließen/i })
      .click();
    await expect(
      formPage.getByText(/anmeldung & einwilligung abgeschlossen/i),
    ).toBeVisible();

    // Check RF-P1 in via /me (no match exists yet — the bracket is generated next).
    await formPage.goto(`/t/${id}/me`);
    await formPage
      .getByRole("button", { name: /online einchecken/i })
      .click();
    await expect(formPage.getByText(/eingecheckt/i)).toBeVisible();

    // Resolve RF-P1's participant id (scoped to this fixture tournament).
    const { data: p1row, error: p1err } = await staff
      .from("participants")
      .select("id")
      .eq("tournament_id", id)
      .eq("display_name", "RF-P1")
      .single();
    if (p1err || !p1row) {
      throw new Error(`RF-P1 participant not found: ${p1err?.message ?? "none"}`);
    }
    const p1Id = p1row.id as string;

    // (2) Organizer seeds + generates the bracket (1 final, both slots filled).
    await loginAsOrganizer(page);
    await page.goto(`/organizer/tournaments/${id}/bracket`);
    await page.getByRole("button", { name: /zufällig setzen/i }).click();
    await page.getByRole("button", { name: /seeding speichern/i }).click();
    await expect(page.getByText(/gespeichert/i)).toBeVisible();
    await page.getByRole("button", { name: /^generieren$/i }).click();
    await expect(page.getByTestId("bracket-view")).toBeVisible();

    // (3) Determine each player's physical side. report_match stores scores
    // match-absolutely (relative to participant_a / participant_b), and the
    // winner is participant_a when score_a > score_b. We make side A win 2:1.
    const finalMatch = await getSingleFinal(staff, id);
    const p1Side = finalMatch.participant_a_id === p1Id ? "a" : "b";

    // (3a) RF-P1 reports through the /me form. The form takes player-relative
    // "Dein Score" / "Gegner-Score" and maps them by side; choose values so the
    // match-absolute result is 2:1 for side A.
    const p1My = p1Side === "a" ? "2" : "1"; // P1's own score
    const p1Opp = p1Side === "a" ? "1" : "2"; // P1's opponent score
    await formPage.reload(); // pick up the now-generated match
    await formPage.getByLabel("Dein Score").fill(p1My);
    await formPage.getByLabel("Gegner-Score").fill(p1Opp);
    await formPage.getByRole("button", { name: /ergebnis melden/i }).click();
    await expect(formPage.getByText(/wartet auf freigabe/i)).toBeVisible();

    // (3b) RF-P2 reports the same match-absolute 2:1 via the RPC from its own
    // anon session — both reports agree.
    const { error: reportErr } = await rpcPlayer.client.rpc("report_match", {
      p_match_id: finalMatch.id,
      p_score_a: 2,
      p_score_b: 1,
    });
    if (reportErr) {
      throw new Error(`report_match failed for RF-P2: ${reportErr.message}`);
    }

    // (4) Organizer opens the matches page: both reports agree, so the "Einig"
    // badge shows the agreed 2:1. Confirm and assert the winner is side A.
    await page.goto(`/organizer/tournaments/${id}/matches`);
    await expect(page.getByText(/✓\s*einig:\s*2:1/i)).toBeVisible();
    await page.getByRole("button", { name: /freigeben/i }).first().click();

    // After confirm: the match renders "2:1 · Sieger: <name>". The winner MUST
    // be the side-A participant (the one who reported the 2 in score_a), not just
    // "one of the two players".
    const expectedWinner = finalMatch.participant_a_id === p1Id ? "RF-P1" : "RF-P2";
    const finalLine = page.getByText(/2:1\s*·\s*sieger:/i);
    await expect(finalLine).toBeVisible();
    expect((await finalLine.textContent()) ?? "").toContain(expectedWinner);
  } finally {
    await formCtx.close();
  }
});
