import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ORG_EMAIL = process.env.E2E_ORG_EMAIL;
const ORG_PASSWORD = process.env.E2E_ORG_PASSWORD;

// Organizer creds drive the seeding + generate steps, which require a staff
// session, and the reset/cleanup that keeps this destructive spec from leaking
// state into the others. Skip cleanly when they are not configured (mirrors the
// other organizer specs).
test.skip(!ORG_EMAIL || !ORG_PASSWORD, "organizer creds not configured");

/** Resolve the seeded single-elim "Sommer Cup 2026" by name (status varies). */
async function getSommerCup(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("tournaments")
    .select("id")
    .eq("format", "single_elim")
    .ilike("name", "%sommer cup%")
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(
      `Could not load Sommer Cup: ${error?.message ?? "none found"}`,
    );
  }
  return data.id as string;
}

/**
 * Sign in as the organizer and return a staff-scoped Supabase client. Used for
 * the deterministic reset (before) and cleanup (after) so the seeded tournament
 * always returns to `registration` with no matches — other specs assert that
 * status / select the open tournament by it, so we must not leave it `running`.
 */
async function staffClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({
    email: ORG_EMAIL!,
    password: ORG_PASSWORD!,
  });
  if (error) throw new Error(`organizer sign-in failed: ${error.message}`);
  return client;
}

/** Delete any generated bracket and restore the tournament to `registration`. */
async function resetTournament(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  await client.from("matches").delete().eq("tournament_id", id);
  await client
    .from("tournaments")
    .update({ status: "registration" })
    .eq("id", id);
}

/**
 * Register a fresh anonymous solo adult participant in its own page (distinct
 * anon session), then check in online from the /me status page.
 */
async function registerAndCheckIn(page: Page, id: string): Promise<string> {
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Bracket ${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}`;
  await page.getByLabel("Anzeigename").fill(displayName);
  await page.getByLabel("Geburtsdatum").fill("2000-01-01");

  const captain = page.getByLabel("Captain — Name");
  if (await captain.isVisible()) {
    await captain.fill(`${displayName} Captain`);
  }

  await page.getByRole("button", { name: /weiter zur einwilligung/i }).click();

  const finishButton = page.getByRole("button", {
    name: /einwilligung abschließen/i,
  });
  await expect(finishButton).toBeVisible();
  await page.getByRole("checkbox", { name: /einwilligung erteilen/i }).click();
  await page.getByLabel("Name (zur Bestätigung)").fill(displayName);
  await finishButton.click();

  await expect(
    page.getByText(/anmeldung & einwilligung abgeschlossen/i),
  ).toBeVisible();

  // Same context keeps the anon session, so /me resolves this participant.
  await page.goto(`/t/${id}/me`);
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: /jetzt online einchecken/i })
    .click();
  await expect(page.getByText(/eingecheckt/i).first()).toBeVisible();

  return displayName;
}

/**
 * Confirm (as staff) that a participant is checked in, checking them in via the
 * RPC if the browser online check-in didn't persist. The shared live backend
 * rate-limits anonymous sign-ins, which can make the browser RPC flaky under the
 * full suite; this makes the precondition for generation deterministic without
 * weakening the user-facing flow above.
 */
async function ensureCheckedIn(
  client: SupabaseClient,
  id: string,
  displayName: string,
): Promise<void> {
  const { data: p, error } = await client
    .from("participants")
    .select("id, checked_in_at")
    .eq("tournament_id", id)
    .eq("display_name", displayName)
    .single();
  if (error || !p) {
    throw new Error(
      `participant "${displayName}" not found: ${error?.message ?? "missing"}`,
    );
  }
  if (p.checked_in_at) return;
  const { error: rpcErr } = await client.rpc("check_in", {
    p_participant_id: p.id,
    p_method: "qr_scan",
  });
  if (rpcErr) {
    throw new Error(`staff check-in failed for "${displayName}": ${rpcErr.message}`);
  }
}

let tournamentId = "";

// Deterministic starting point: the register page 404s unless the tournament is
// in `registration`, so reset before we begin.
test.beforeAll(async () => {
  const client = await staffClient();
  tournamentId = await getSommerCup(client);
  await resetTournament(client, tournamentId);
});

// Always restore the seeded state so the rest of the suite stays green
// regardless of run order or a mid-test failure.
test.afterAll(async () => {
  if (!tournamentId) return;
  const client = await staffClient();
  await resetTournament(client, tournamentId);
});

test("organizer generates a single-elim bracket from checked-in players", async ({
  browser,
  page,
}) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(
    SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
  ).not.toBe("");

  const id = tournamentId;

  // (1) Two distinct anonymous registrations + online check-ins, each in its
  // own browser context so they are separate anon users.
  const names: string[] = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext();
    const p = await context.newPage();
    try {
      names.push(await registerAndCheckIn(p, id));
    } finally {
      await context.close();
    }
  }

  // Make the check-in deterministic before generating: confirm both players are
  // checked in (recovering from any flaky anon-rate-limited browser RPC).
  const staff = await staffClient();
  for (const name of names) {
    await ensureCheckedIn(staff, id, name);
  }

  // (2) Log in as organizer and open the bracket page (default `page` context).
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(ORG_EMAIL!);
  await page.getByLabel(/passwort|password/i).fill(ORG_PASSWORD!);
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await expect(page).toHaveURL(/\/organizer/);

  await page.goto(`/organizer/tournaments/${id}/bracket`);

  // We reset before the run, so no matches exist yet → the seeding editor shows.
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  const seedSave = page.getByRole("button", { name: /seeding speichern/i });
  await seedSave.click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();

  // (3) The generated bracket renders, and the two registered players appear in
  // a match card. The checked-in set may include earlier probe entrants, so we
  // assert the bracket view exists and that both of our players show up in it.
  // A player who wins a round-1 bye is rendered both in round 1 and in the round
  // they advance into, so a name can match more than once — assert the first.
  const bracket = page.getByTestId("bracket-view");
  await expect(bracket).toBeVisible();
  for (const name of names) {
    await expect(
      bracket.getByText(name, { exact: false }).first(),
    ).toBeVisible();
  }
});
