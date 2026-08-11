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
  namePrefix: "E2E Checkin",
  teamSize: 1,
});

test("online check-in from participant status page", async ({ page }) => {
  const id = tournamentId();

  // Register a fresh anonymous solo adult participant (keeps anon session cookies).
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Checkin ${Date.now()}`;
  await fillRegistrationForm(page, {
    displayName: displayName,
    birthdate: "2000-01-01",
  });

  // Ohne Fotoerlaubnis weiter: der Check-in darf davon nicht abhängen.
  await page
    .getByRole("button", { name: /ohne fotoerlaubnis fortfahren/i })
    .click();

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();

  // The same context keeps the anon session, so /me resolves this participant.
  await page.goto(`/t/${id}/me`);
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();

  await page
    .getByRole("button", { name: /jetzt online einchecken/i })
    .click();

  await expect(page.getByText(/eingecheckt/i)).toBeVisible();
});
