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
  namePrefix: "E2E Solo",
  teamSize: 1,
});

test("solo adult registration + checkbox photo consent", async ({ page }) => {
  const id = tournamentId();
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Solo ${Date.now()}`;
  await fillRegistrationForm(page, {
    displayName: displayName,
    birthdate: "2000-01-01",
  });

  // Photo consent step (adult -> checkbox path). Optional, but this test walks
  // the granting path — the skip path is covered in register-minor.spec.ts.
  const finishButton = page.getByRole("button", {
    name: /^fotoerlaubnis erteilen$/i,
  });
  await expect(finishButton).toBeVisible();
  // Nothing ticked, no address: granting stays disabled.
  await expect(finishButton).toBeDisabled();

  // Die Checkbox heisst nicht "Fotoerlaubnis erteilen" — so heisst der Knopf
  // darunter. Ihr zugaenglicher Name IST der Einwilligungstext: das Label
  // umschliesst sie, ein zusaetzliches aria-label waere ein zweiter Name und
  // wurde in ad71491 bewusst entfernt. Auf diesem Schritt gibt es genau eine
  // Checkbox, also wird sie ueber ihre Rolle geholt.
  await page.getByRole("checkbox").click();
  await page.getByLabel("Name (zur Bestätigung)").fill(displayName);
  await page.getByLabel("Wohnhaft (Anschrift)").fill("Teststraße 1, 23769 Fehmarn");

  await expect(finishButton).toBeEnabled();
  await finishButton.click();

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();
});
