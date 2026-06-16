import { test, expect } from "@playwright/test";

test("home page renders heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turnier/i })).toBeVisible();
});
