import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  loginAsOrganizer,
  registerAndCheckIn,
  withFixtureTournament,
} from "./fixtures";

// Eigenes Wegwerf-Turnier statt Dashboard-Klick auf das hartkodierte
// "Sommer Cup" (finished + archiviert, taucht im Dashboard nicht mehr auf).
// Ohne Teilnehmer rendert die Seite nur den Leer-Hinweis, keine Tabelle —
// registerAndCheckIn liefert genau, was die Spec sehen will: einen Teilnehmer
// samt Consent-Zeile (Fotoerlaubnis-Spalte).
test.skip(!hasOrgCreds, "organizer creds not configured");
const tournamentId = withFixtureTournament({ namePrefix: "E2E Participants" });

const displayName = `E2E Part P ${Date.now()}`;
test.beforeAll(async () => {
  await registerAndCheckIn(tournamentId(), displayName);
});

test("organizer sees participants with photo consent status", async ({
  page,
}) => {
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${tournamentId()}/participants`);

  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText(displayName)).toBeVisible();
});
