import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  loginAsOrganizer,
  registerAndCheckIn,
  withFixtureTournament,
} from "./fixtures";

// Eigenes Wegwerf-Turnier statt Dashboard-Klick auf das hartkodierte
// "Sommer Cup" (finished + archiviert, taucht im Dashboard nicht mehr auf).
test.skip(!hasOrgCreds, "organizer creds not configured");
const tournamentId = withFixtureTournament({ namePrefix: "E2E Checkin" });

// Ohne Teilnehmer rendert die Seite nur den Leer-Hinweis, keine Tabelle —
// also einen eingecheckten Teilnehmer anlegen. Laeuft nach dem beforeAll der
// Fixture (Playwright fuehrt beforeAll-Hooks in Registrierungsreihenfolge aus).
test.beforeAll(async () => {
  await registerAndCheckIn(tournamentId(), `E2E Checkin P ${Date.now()}`);
});

test("organizer check-in page shows station QR and attendance table", async ({
  page,
}) => {
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${tournamentId()}/checkin`);

  // Scanner container + title render (camera feed itself is not asserted —
  // headless has no camera and may show a permission prompt).
  await expect(page.getByText(/qr-scanner/i)).toBeVisible();
  await expect(page.getByTestId("qr-scanner")).toBeVisible();

  // Station QR (the QrCode svg carries this aria-label).
  await expect(
    page.getByLabel("Stations-QR zum Self-Check-in"),
  ).toBeVisible();

  // Attendance list table renders.
  await expect(page.getByRole("table").first()).toBeVisible();
});
