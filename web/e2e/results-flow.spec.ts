// End-to-end results flow on the seeded single-elim "Sommer Cup 2026":
// register + check in two solo adults → organizer seeds + generates a 2-entrant
// final → both players report agreeing scores on /me → organizer confirms on the
// Matches tab and the match shows `done` with the winner.
//
// Advancement note: a 2-entrant single-elim has only the final, which has no
// `next_match`, so this spec does not exercise winner-advancement. A 4-entrant
// Playwright flow would need four anonymous registrations against the shared,
// per-IP rate-limited live backend (the same limit the other specs work around
// with workers:1 + staff-side check-in recovery), making it flaky. The
// `confirm_match` advancement path (write winner into `next_match_id`/`next_slot`)
// is instead covered by the RPC's SQL logic plus the bracket link-resolution /
// bye-propagation unit tests (resolve-links.test.ts). The gap is intentional.
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ORG_EMAIL = process.env.E2E_ORG_EMAIL;
const ORG_PASSWORD = process.env.E2E_ORG_PASSWORD;

// The full results flow needs a staff session to seed/generate and to confirm
// the result. Skip cleanly when organizer creds are not configured (mirrors the
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
 * always returns to `registration` with no matches/reports — other specs assert
 * that status / select the open tournament by it, so we must not leave it
 * `running`.
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

/**
 * Delete any generated bracket (which cascades match_reports) and restore the
 * tournament to `registration`.
 */
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
 * anon session), then check in online from the /me status page. Returns the
 * display name.
 */
async function registerAndCheckIn(page: Page, id: string): Promise<string> {
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Results ${Date.now()}-${Math.floor(
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
  await page.getByRole("button", { name: /jetzt online einchecken/i }).click();
  await expect(page.getByText(/eingecheckt/i).first()).toBeVisible();

  return displayName;
}

/**
 * Confirm (as staff) that a participant is checked in, checking them in via the
 * RPC if the browser online check-in didn't persist. The shared live backend
 * rate-limits anonymous sign-ins, which can make the browser RPC flaky under the
 * full suite; this makes the precondition for generation deterministic.
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
    throw new Error(
      `staff check-in failed for "${displayName}": ${rpcErr.message}`,
    );
  }
}

/**
 * Reset the checked-in set to EXACTLY the two named participants by clearing
 * `checked_in_at` for everyone else in the tournament. Earlier specs/probe runs
 * can leave stray checked-in entrants in the shared backend; without this, the
 * generated bracket could have >2 entrants (multiple matches, our two players in
 * different pairings), which would break the single-final report→confirm flow.
 */
async function keepOnlyCheckedIn(
  client: SupabaseClient,
  id: string,
  keepNames: string[],
): Promise<void> {
  const { data: parts, error } = await client
    .from("participants")
    .select("id, display_name, checked_in_at")
    .eq("tournament_id", id)
    .not("checked_in_at", "is", null);
  if (error) {
    throw new Error(`could not load checked-in participants: ${error.message}`);
  }
  const keep = new Set(keepNames);
  const drop = (parts ?? []).filter((p) => !keep.has(p.display_name));
  for (const p of drop) {
    await client
      .from("participants")
      .update({ checked_in_at: null })
      .eq("id", p.id)
      .eq("tournament_id", id);
  }
}

/**
 * Resolve which physical side ('a' | 'b') a named participant occupies in the
 * tournament's only generated match. Lets the test drive each player's
 * "Dein Score"/"Gegner-Score" so the resulting match-term score is a fixed,
 * deterministic value regardless of how seeding placed the two players.
 */
async function sideOf(
  client: SupabaseClient,
  id: string,
  displayName: string,
): Promise<"a" | "b"> {
  const { data: p, error: pErr } = await client
    .from("participants")
    .select("id")
    .eq("tournament_id", id)
    .eq("display_name", displayName)
    .single();
  if (pErr || !p) {
    throw new Error(`participant "${displayName}" not found for side lookup`);
  }
  const { data: m, error: mErr } = await client
    .from("matches")
    .select("participant_a_id, participant_b_id")
    .eq("tournament_id", id)
    .or(`participant_a_id.eq.${p.id},participant_b_id.eq.${p.id}`)
    .limit(1)
    .single();
  if (mErr || !m) {
    throw new Error(`match for "${displayName}" not found for side lookup`);
  }
  return m.participant_a_id === p.id ? "a" : "b";
}

/** Log in as the organizer through the UI (default `page` context). */
async function loginAsOrganizer(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(ORG_EMAIL!);
  await page.getByLabel(/passwort|password/i).fill(ORG_PASSWORD!);
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await expect(page).toHaveURL(/\/organizer/);
}

let tournamentId = "";

// Deterministic starting point: register 404s unless the tournament is in
// `registration`, so reset before we begin.
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

test("players report agreeing scores and the referee confirms the result", async ({
  browser,
  page,
}) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(
    SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
  ).not.toBe("");

  const id = tournamentId;

  // (1) Two distinct anonymous registrations + online check-ins, each in its own
  // browser context (separate anon users). Keep the contexts open so the same
  // anon session can later report on /me.
  const contexts = [];
  const pages: Page[] = [];
  const names: string[] = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext();
    const p = await context.newPage();
    contexts.push(context);
    pages.push(p);
    names.push(await registerAndCheckIn(p, id));
  }

  try {
    // Make the check-in deterministic before generating, then narrow the
    // checked-in set to exactly our two players so the bracket is a single
    // 2-entrant final (both slots filled, both can report).
    const staff = await staffClient();
    for (const name of names) {
      await ensureCheckedIn(staff, id, name);
    }
    await keepOnlyCheckedIn(staff, id, names);

    // (2) Organizer seeds + generates the bracket (1 final match, both slots
    // filled) in the default `page` context.
    await loginAsOrganizer(page);
    await page.goto(`/organizer/tournaments/${id}/bracket`);
    await page.getByRole("button", { name: /zufällig setzen/i }).click();
    await page.getByRole("button", { name: /seeding speichern/i }).click();
    await expect(page.getByText(/gespeichert/i)).toBeVisible();
    await page.getByRole("button", { name: /^generieren$/i }).click();
    await expect(page.getByTestId("bracket-view")).toBeVisible();

    // (3) Each participant opens /me and reports agreeing scores. We resolve
    // each player's physical side from the DB and drive their "Dein Score" /
    // "Gegner-Score" so the resulting match-term score is a deterministic 2:1
    // (side A wins) no matter how seeding placed them. The side-A player enters
    // Dein=2/Gegner=1; the side-B player enters Dein=1/Gegner=2 → both reports
    // map to match-term score_a=2, score_b=1, i.e. they agree.
    const sides = await Promise.all(
      names.map((name) => sideOf(staff, id, name)),
    );
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      await p.goto(`/t/${id}/me`);
      const card = p.getByText(/dein aktuelles match/i);
      await expect(card).toBeVisible();
      const onSideA = sides[i] === "a";
      const myScore = onSideA ? "2" : "1";
      const oppScore = onSideA ? "1" : "2";
      await p.getByLabel("Dein Score").fill(myScore);
      await p.getByLabel("Gegner-Score").fill(oppScore);
      await p.getByRole("button", { name: /ergebnis melden/i }).click();
      await expect(p.getByText(/wartet auf freigabe/i)).toBeVisible();
    }

    // (4) Organizer opens the matches page: both reports agree, so the "Einig"
    // badge shows the agreed score. Confirm and assert the match is done with a
    // winner. The agreed match-term score is 2:1 (winner on side ?, loser on the
    // other) — the seeding decides which physical side each player lands on, so
    // assert on the agreed score and the done state rather than a fixed side.
    await page.goto(`/organizer/tournaments/${id}/matches`);
    const einig = page.getByText(/✓\s*einig:\s*2:1/i);
    await expect(einig).toBeVisible();

    await page.getByRole("button", { name: /freigeben/i }).first().click();

    // After confirm: the match renders the final "X:Y · Sieger: <name>" line.
    const finalLine = page.getByText(/2:1\s*·\s*sieger:/i);
    await expect(finalLine).toBeVisible();

    // The winner is one of our two registered players.
    const winnerText = (await finalLine.textContent()) ?? "";
    expect(names.some((n) => winnerText.includes(n))).toBe(true);
  } finally {
    for (const context of contexts) {
      await context.close();
    }
  }
});
