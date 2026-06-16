import { test, expect } from "@playwright/test";

test("home page renders heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turnier/i })).toBeVisible();
});

test("home page lists seeded games from Supabase", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Valorant")).toBeVisible();
  await expect(page.getByText("FIFA")).toBeVisible();
});
