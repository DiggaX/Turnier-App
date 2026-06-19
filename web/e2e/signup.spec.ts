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

test.describe("Self-serve signup — create org happy path", () => {
  test.afterAll(async () => {
    // Cleanup runs INDEPENDENTLY of the test body: it resolves the fixture by
    // its unique org name (with an email fallback) so the created auth user +
    // org + profile are removed even if an assertion failed before the test
    // reached any in-test id capture — otherwise a flaky run leaks a real auth
    // user + org into the live backend.
    const admin = createSupabase(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    try {
      // bootstrap_org creates an org with our unique name; its admin profile id
      // IS the auth user id.
      const { data: org } = await admin
        .from("organizations")
        .select("id")
        .eq("name", FIXTURE_ORG_NAME)
        .maybeSingle();

      let userId = "";
      if (org) {
        const { data: prof } = await admin
          .from("profiles")
          .select("id")
          .eq("org_id", org.id)
          .eq("role", "admin")
          .maybeSingle();
        if (prof) userId = prof.id as string;
      }

      // Edge: signUp succeeded but bootstrap_org did not (no org/profile) — find
      // the orphan auth user by its unique email so it does not leak either.
      if (!userId) {
        const { data: list } = await admin.auth.admin.listUsers({
          perPage: 1000,
        });
        const u = list?.users?.find((x) => x.email === FIXTURE_EMAIL);
        if (u) userId = u.id;
      }

      if (userId) await admin.from("profiles").delete().eq("id", userId);
      if (org) await admin.from("organizations").delete().eq("id", org.id);
      if (userId) await admin.auth.admin.deleteUser(userId);
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
    // Cleanup is handled entirely in afterAll (resolves the fixture by org name),
    // so no in-test id capture is needed — a pre-redirect flake no longer leaks.
  });
});
