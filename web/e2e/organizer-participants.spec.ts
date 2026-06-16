import { test, expect } from "@playwright/test";
const email = process.env.E2E_ORG_EMAIL, password = process.env.E2E_ORG_PASSWORD;
test.skip(!email || !password, "organizer creds not configured");
test("organizer sees participants with consent status", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(email!);
  await page.getByLabel(/passwort|password/i).fill(password!);
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await expect(page).toHaveURL(/\/organizer/);
  await page.getByRole("link", { name: /sommer cup/i }).click();
  await expect(page.getByRole("table")).toBeVisible();
});
