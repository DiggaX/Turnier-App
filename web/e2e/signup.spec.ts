// End-to-end: self-serve signup happy path (Multi-Tenancy 2b).
//
// The test goes to /signup, fills a unique email + password + org name, submits,
// and asserts the user lands on /organizer (email-confirm OFF assumed) OR /login
// (if email-confirm is unexpectedly ON — noted so CI does not fail silently).
//
// afterAll: delete the created auth user + profile + org via a service-role client
// so the test is repeatable (no leaked fixture orgs).
//
// Invite-redemption flows are covered by the db2 guard checks from Task 1 — they
// require a second fresh auth user which would complicate cleanup here.
//
// This spec requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY to be set in web/.env.local (or the test environment).
// If these are absent the spec skips cleanly.
import { test, expect } from "@playwright/test";
import { createClient as createSupabase } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Skip the entire suite when the required env vars are not configured.
// This avoids a hard failure in CI environments that don't set service-role key
// (e.g. preview deploys without secrets).
test.skip(
  !SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY,
  "Supabase URL, anon key, and service-role key must all be set to run signup e2e",
);

const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const FIXTURE_EMAIL = `e2e-signup-${uniqueSuffix}@test.invalid`;
const FIXTURE_PASSWORD = "Test1234!";
const FIXTURE_ORG_NAME = `E2E Org ${uniqueSuffix}`;

/** Auth user id captured during the test for cleanup. */
let createdUserId = "";

test.describe("Self-serve signup — create org happy path", () => {
  test.afterAll(async () => {
    // Cleanup: delete the org + profile + auth user created by the test so that
    // re-running the spec with the same seed produces a clean slate.
    if (!createdUserId) return;
    try {
      const admin = createSupabase(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Fetch the org_id from profiles before deleting the profile.
      const { data: profile } = await admin
        .from("profiles")
        .select("org_id")
        .eq("id", createdUserId)
        .maybeSingle();

      // Delete profile row (no FK cascade needed — we do it explicitly).
      await admin.from("profiles").delete().eq("id", createdUserId);

      // Delete the org (cascades to org_invites).
      if (profile?.org_id) {
        await admin.from("organizations").delete().eq("id", profile.org_id);
      }

      // Delete the auth user.
      await admin.auth.admin.deleteUser(createdUserId);
    } catch {
      // Best-effort — a failure here leaves a small fixture in the DB but does
      // not break the test result.
    }
  });

  test("fills signup form and lands on /organizer (or /login if email-confirm ON)", async ({
    page,
  }) => {
    await page.goto("/signup");

    // The page must render the registration heading/logo.
    await expect(
      page.getByText(/turnier/i, { exact: false }),
    ).toBeVisible();

    // Fill the form.
    await page.getByLabel(/e-?mail/i).fill(FIXTURE_EMAIL);
    await page.getByLabel(/passwort|password/i).fill(FIXTURE_PASSWORD);
    await page.getByLabel(/firmen(name)?/i).fill(FIXTURE_ORG_NAME);

    // Submit.
    await page.getByRole("button", { name: /organisation registrieren/i }).click();

    // With email-confirm OFF the server action redirects to /organizer.
    // With email-confirm unexpectedly ON, Supabase still signs up but the
    // session cookie is absent, so the /organizer page redirects to /login.
    // We accept both outcomes — log which one occurred.
    await expect(page).toHaveURL(/\/(organizer|login)/, { timeout: 15_000 });

    const finalUrl = page.url();
    if (!finalUrl.includes("/organizer")) {
      // Email-confirm appears to be ON — note it but don't fail the spec.
      // The important thing is the signup call itself did not error.
      console.warn(
        "[signup e2e] Landed on /login instead of /organizer — " +
          "email confirmation may be ON in the Supabase project. " +
          "Disable it at Auth → Providers → Email → 'Confirm email'.",
      );
    }

    // Resolve the created user id via the anon client (it's a fresh session or
    // we use service-role to look it up by email for cleanup).
    const admin = createSupabase(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user: foundUser } } = await admin.auth.admin.getUserByEmail(FIXTURE_EMAIL);
    if (foundUser) createdUserId = foundUser.id;
  });
});
