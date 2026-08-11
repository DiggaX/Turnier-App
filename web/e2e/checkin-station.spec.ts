import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  withFixtureTournament,
  fillRegistrationForm,
} from "./fixtures";

// Eigenes Wegwerf-Turnier: kein fremdes Turnier vollschreiben, und die
// Teamgroesse steht fest, statt vom Zufall abzuhaengen.
test.skip(!hasOrgCreds, "organizer creds not configured");
const tournamentId = withFixtureTournament({
  namePrefix: "E2E Station",
  teamSize: 1,
});

test("station check-in from QR landing page", async ({ page }) => {
  const id = tournamentId();

  // Register a fresh anonymous solo adult participant (keeps anon session cookies).
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Station ${Date.now()}`;
  await fillRegistrationForm(page, {
    displayName: displayName,
    birthdate: "2000-01-01",
  });

  // Ohne Fotoerlaubnis weiter: der Check-in darf davon nicht abhängen.
  await page
    .getByRole("button", { name: /ohne fotoerlaubnis fortfahren/i })
    .click();

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();

  // Navigate to the station check-in URL (simulates scanning the station QR).
  await page.goto(`/t/${id}/checkin-station`);

  // The page should auto-check in and show the success message.
  await expect(
    page.getByText(/du bist eingecheckt/i),
  ).toBeVisible();
});
