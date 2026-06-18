// Public multi-tenancy e2e — no staff account required.
//
// These specs exercise the two new public surfaces added in Multi-Tenancy 2a:
//   1. /o/eventpilot — per-org page that lists the org's tournaments.
//   2. /         — home is now a landing + org directory.
//
// Org-management isolation (RLS cross-org write blocking) is verified via db2
// simulated-role queries in Task 1, not here — that check needs two full staff
// accounts which Phase 2b's self-serve signup will enable.
//
// Requirements satisfied:
//   • /o/eventpilot renders and lists "Sommer Cup 2026".
//   • Home shows an "Eventpilot" link that navigates to /o/eventpilot.
import { test, expect } from "@playwright/test";

test.describe("Public org page /o/eventpilot", () => {
  test("renders and lists Sommer Cup 2026", async ({ page }) => {
    await page.goto("/o/eventpilot");

    // The org heading must show the org name.
    await expect(
      page.getByRole("heading", { name: /eventpilot/i }),
    ).toBeVisible();

    // The seeded tournament must appear on the page.
    await expect(page.getByText("Sommer Cup 2026")).toBeVisible();
  });
});

test.describe("Home page org directory", () => {
  test("shows the Eventpilot link and navigates to the org page", async ({
    page,
  }) => {
    await page.goto("/");

    // The hero heading should be present.
    await expect(
      page.getByRole("heading", { name: /turnier/i }),
    ).toBeVisible();

    // An "Eventpilot" link (org card) must be visible in the org directory.
    const orgLink = page.getByRole("link", { name: /eventpilot/i });
    await expect(orgLink.first()).toBeVisible();

    // Clicking the link must navigate to /o/eventpilot.
    await orgLink.first().click();
    await expect(page).toHaveURL(/\/o\/eventpilot/);

    // The org page must render the org heading.
    await expect(
      page.getByRole("heading", { name: /eventpilot/i }),
    ).toBeVisible();
  });
});
