import { test, expect } from "@playwright/test";

test("home page renders the hero heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turnier/i })).toBeVisible();
});

test("home page lists the seeded tournament from Supabase", async ({
  page,
}) => {
  await page.goto("/");

  // Seeded tournament (status: registration) is rendered as a card.
  await expect(page.getByText("Sommer Cup 2026")).toBeVisible();

  // Its "Anmelden" button links to the tournament's register page.
  const registerLink = page
    .locator('a[href^="/t/"][href$="/register"]')
    .filter({ hasText: /anmelden/i });
  await expect(registerLink.first()).toBeVisible();
});
