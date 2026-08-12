// Public multi-tenancy e2e — no staff account required.
//
// These specs exercise the two public surfaces added in Multi-Tenancy 2a:
//   1. /o/<slug> — per-org page.
//   2. /        — home is a landing + org directory.
//
// The org under test is whatever the live DB lists first (organizations is
// publicly readable — home lists them). The specs assert the surfaces render
// with the org's NAME; which tournaments are publicly visible depends on
// production state and is nobody's promise, so it is not asserted.
//
// Org-management isolation (RLS cross-org write blocking) is verified via db2
// simulated-role queries in Task 1, not here — that check needs two full staff
// accounts which Phase 2b's self-serve signup will enable.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let orgSlug = "";
let orgName = "";

test.beforeAll(async () => {
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await anon
    .from("organizations")
    .select("slug, name")
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(`No organization in the DB: ${error?.message ?? "none"}`);
  }
  orgSlug = data.slug as string;
  orgName = data.name as string;
});

test.describe("Public org page /o/<slug>", () => {
  test("renders with the org name as heading", async ({ page }) => {
    await page.goto(`/o/${orgSlug}`);

    // getByRole name takes the plain string (substring, case-insensitive) —
    // no RegExp built from the name, which may contain metachars ("-", "." …).
    await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  });
});

test.describe("Home page org directory", () => {
  test("shows the org link and navigates to the org page", async ({ page }) => {
    await page.goto("/");

    // The hero heading should be present.
    await expect(
      page.getByRole("heading", { name: /turnier/i }),
    ).toBeVisible();

    // An org card link must be visible in the org directory.
    const orgLink = page.getByRole("link", { name: orgName });
    await expect(orgLink.first()).toBeVisible();

    // Clicking the link must navigate to the org page.
    await orgLink.first().click();
    await expect(page).toHaveURL((url) => url.pathname === `/o/${orgSlug}`);

    // The org page must render the org heading.
    await expect(page.getByRole("heading", { name: orgName })).toBeVisible();
  });
});
