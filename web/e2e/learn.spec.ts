import { test, expect } from "@playwright/test";

test("learn page renders the Next Level hero and a CTA into the app", async ({
  page,
}) => {
  await page.goto("/learn");

  // Hero headline highlights "Next Level".
  await expect(
    page.getByRole("heading", { name: /next\s*level/i }).first(),
  ).toBeVisible();

  // A call-to-action links into the real app (home, "/").
  const cta = page.locator('a[href="/"]').filter({ hasText: /join a tournament/i });
  await expect(cta.first()).toBeVisible();
});

test("nav 'Learning' link navigates from home to /learn", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Learning" }).first().click();

  await expect(page).toHaveURL(/\/learn$/);
  await expect(
    page.getByRole("heading", { name: /next\s*level/i }).first(),
  ).toBeVisible();
});
