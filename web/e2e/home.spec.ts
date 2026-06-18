import { test, expect } from "@playwright/test";

test("home page renders the hero heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turnier/i })).toBeVisible();
});
