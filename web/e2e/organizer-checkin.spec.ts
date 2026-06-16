import { test, expect } from "@playwright/test";

const email = process.env.E2E_ORG_EMAIL,
  password = process.env.E2E_ORG_PASSWORD;
test.skip(!email || !password, "organizer creds not configured");

test("organizer check-in page shows station QR and attendance table", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(email!);
  await page.getByLabel(/passwort|password/i).fill(password!);
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await expect(page).toHaveURL(/\/organizer/);

  // Reach the seeded "Sommer Cup 2026" participants page to capture its id from
  // the URL, then open the check-in route for the same tournament.
  await page.getByRole("link", { name: /sommer cup/i }).click();
  await expect(page).toHaveURL(/\/organizer\/tournaments\/[^/]+\/participants/);
  const match = page.url().match(/\/tournaments\/([^/]+)\/participants/);
  const id = match?.[1];
  expect(id, "could not resolve tournament id").toBeTruthy();

  await page.goto(`/organizer/tournaments/${id}/checkin`);

  // Scanner container + title render (camera feed itself is not asserted —
  // headless has no camera and may show a permission prompt).
  await expect(page.getByText(/qr-scanner/i)).toBeVisible();
  await expect(page.getByTestId("qr-scanner")).toBeVisible();

  // Station QR (the QrCode svg carries this aria-label).
  await expect(
    page.getByLabel("Stations-QR zum Self-Check-in"),
  ).toBeVisible();

  // Attendance list table renders.
  await expect(page.getByRole("table")).toBeVisible();
});
