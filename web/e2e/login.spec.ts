import { test, expect } from "@playwright/test";

const email = process.env.E2E_ORG_EMAIL;
const password = process.env.E2E_ORG_PASSWORD;

test.skip(!email || !password, "organizer creds not configured");

test("organizer can sign in with password", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(email!);
  await page.getByLabel(/passwort|password/i).fill(password!);
  await page
    .getByRole("button", { name: /anmelden|sign in|login/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/organizer/);
});
