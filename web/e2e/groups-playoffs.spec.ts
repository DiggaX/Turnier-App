// End-to-end Groups → Playoffs (Plan 9) against the live hosted Supabase:
// an organizer generates + views a groups->playoffs bracket for 8 entrants
// (2 groups of 4, 12 group matches), confirms all group matches via the RPC,
// then clicks "Playoffs auslosen" to seed the single-elim playoff from the
// group standings (4 advancers, 2 per group).
//
// This spec is fully self-contained: it creates a throwaway fixture tournament
// (unique name, format='groups_playoffs') with 8 programmatically registered +
// checked-in participants in `beforeAll`, and deletes it in `afterAll`
// (cascades to participants / matches / consents). It never touches the shared
// seeded "Sommer Cup 2026", so it is order-independent relative to other specs.
//
// Participants are set up programmatically (not via 8 browser flows): the live
// backend rate-limits anonymous sign-ins per IP, and 8 browser registrations
// would be slow + flaky. Each participant gets its own anon supabase-js client
// (its own auth user) so the owner-scoped insert/consent/check_in RLS is
// satisfied exactly as the real participant flow does it.
//
// NOTE: This spec requires the `matches.group_no` migration
// (supabase/migrations/20260624090000_groups_playoffs.sql) to be applied to
// the hosted Supabase project. Without it, generateBracket will fail on insert
// and the tests will error. Apply the migration manually via the SQL Editor
// before running this spec in CI.
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ORG_EMAIL = process.env.E2E_ORG_EMAIL;
const ORG_PASSWORD = process.env.E2E_ORG_PASSWORD;

// Generation + confirmation require a staff session. Skip cleanly when organizer
// creds are not configured (mirrors the other organizer specs).
test.skip(!ORG_EMAIL || !ORG_PASSWORD, "organizer creds not configured");

/**
 * Sign in as the organizer and return a staff-scoped Supabase client. Used to
 * create/seed/delete the fixture tournament and to confirm results.
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

/** Resolve the Valorant game id (the format/mode the fixture tournament uses). */
async function getValorantGameId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client
    .from("games")
    .select("id")
    .eq("name", "Valorant")
    .single();
  if (error || !data) {
    throw new Error(`Could not load Valorant game: ${error?.message ?? "none"}`);
  }
  return data.id as string;
}

/** Resolve the organizer's org_id — staff write RLS requires org_id = current_org_id(). */
async function getOrgId(client: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await client.auth.getUser();
  const { data, error } = await client
    .from("profiles")
    .select("org_id")
    .eq("id", user?.id ?? "")
    .single();
  if (error || !data?.org_id) {
    throw new Error(`Could not resolve org_id: ${error?.message ?? "none"}`);
  }
  return data.org_id as string;
}

/**
 * Register a fresh anonymous solo adult participant for the fixture tournament
 * using its own anon client (its own auth user), then check them in online.
 * Mirrors the real participant flow's DB writes: participant row → consent row →
 * `check_in('online')` RPC. Returns the new participant id.
 */
async function registerAndCheckIn(
  tournamentId: string,
  displayName: string,
): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: auth, error: authErr } = await client.auth.signInAnonymously();
  if (authErr || !auth.user) {
    throw new Error(`anon sign-in failed: ${authErr?.message ?? "no user"}`);
  }

  const { data: part, error: partErr } = await client
    .from("participants")
    .insert({
      tournament_id: tournamentId,
      user_id: auth.user.id,
      type: "solo",
      display_name: displayName,
      birthdate: "2000-01-01",
    })
    .select("id")
    .single();
  if (partErr || !part) {
    throw new Error(`participant insert failed: ${partErr?.message ?? "none"}`);
  }
  const participantId = part.id as string;

  const { error: consentErr } = await client.from("consents").insert({
    participant_id: participantId,
    grantor: "self",
    grantor_name: displayName,
    method: "checkbox",
  });
  if (consentErr) {
    throw new Error(`consent insert failed: ${consentErr.message}`);
  }

  const { error: checkInErr } = await client.rpc("check_in", {
    p_participant_id: participantId,
    p_method: "online",
  });
  if (checkInErr) {
    throw new Error(`check_in failed for ${displayName}: ${checkInErr.message}`);
  }

  return participantId;
}

/** Log in as the organizer through the UI (default `page` context). */
async function loginAsOrganizer(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(ORG_EMAIL!);
  await page.getByLabel(/passwort|password/i).fill(ORG_PASSWORD!);
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await expect(page).toHaveURL(/\/organizer/);
}

let fixtureId = "";

// Create a throwaway groups->playoffs fixture tournament with 8 checked-in players.
// N=8 → G=ceil(8/4)=2 groups of 4 → C(4,2)=6 matches per group → 12 group matches.
// Top 2 per group advance → 4 playoff advancers → single-elim of 4 (2 semis + 1 final).
test.beforeAll(async () => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const staff = await staffClient();
  const gameId = await getValorantGameId(staff);
  const orgId = await getOrgId(staff);

  const name = `GroupsPlayoffs Test ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { data: t, error: tErr } = await staff
    .from("tournaments")
    .insert({
      name,
      game_id: gameId,
      org_id: orgId,
      format: "groups_playoffs",
      mode: "hybrid",
      status: "registration",
    })
    .select("id")
    .single();
  if (tErr || !t) {
    throw new Error(`fixture tournament insert failed: ${tErr?.message ?? "none"}`);
  }
  fixtureId = t.id as string;

  // 8 checked-in participants → 2 groups of 4, 12 group matches, 4 advancers.
  for (let i = 1; i <= 8; i++) {
    await registerAndCheckIn(fixtureId, `GP-P${i}`);
  }
});

// Always remove the fixture so nothing leaks into the shared backend; the
// delete cascades to participants / matches / consents.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("organizer generates and views the group stage", async ({ page }) => {
  const id = fixtureId;

  // (1) Organizer seeds + generates the group stage bracket.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();

  // (2) The groups view renders with both group labels and match schedule.
  // N=8 → 2 groups of 4 → data-testid="groups-view" visible.
  await expect(page.getByTestId("groups-view")).toBeVisible();
  await expect(page.getByText("Gruppe A")).toBeVisible();
  await expect(page.getByText("Gruppe B")).toBeVisible();

  // (3) The public board renders the groups view (login-free, anon RLS).
  await page.goto(`/t/${id}/board`);
  await expect(page.getByTestId("groups-view")).toBeVisible();
  await expect(page.getByText("Gruppe A")).toBeVisible();
  await expect(page.getByText("Gruppe B")).toBeVisible();
});

test("confirms all group matches and unlocks the playoff button", async () => {
  const staff = await staffClient();
  const id = fixtureId;

  // The bracket was generated by the previous test. Read all group matches
  // (group_no IS NOT NULL).
  const { data: matches, error } = await staff
    .from("matches")
    .select("id, status, group_no, participant_a_id, participant_b_id")
    .eq("tournament_id", id)
    .not("group_no", "is", null);
  if (error) throw new Error(`could not load group matches: ${error.message}`);

  const pending = (matches ?? []).filter(
    (m) =>
      m.status === "pending" &&
      m.participant_a_id != null &&
      m.participant_b_id != null,
  );

  // N=8 → 2 groups of 4 → C(4,2)=6 per group → 12 group matches total.
  expect(
    (matches ?? []).length,
    "N=8 groups->playoffs must have 12 group matches",
  ).toBe(12);
  expect(
    pending.length,
    "all 12 group matches must start as pending",
  ).toBe(12);

  // Confirm every group match via the staff RPC (side A wins each).
  for (const m of pending) {
    const { error: confirmErr } = await staff.rpc("confirm_match", {
      p_match_id: m.id,
      p_score_a: 2,
      p_score_b: 0,
    });
    if (confirmErr) {
      throw new Error(`confirm_match failed for ${m.id}: ${confirmErr.message}`);
    }
  }

  // Verify all group matches are now done.
  const { data: afterAll, error: afterErr } = await staff
    .from("matches")
    .select("status")
    .eq("tournament_id", id)
    .not("group_no", "is", null);
  if (afterErr) throw new Error(`re-read group matches failed: ${afterErr.message}`);
  expect(
    (afterAll ?? []).every((m) => m.status === "done" || m.status === "bye"),
    "all group matches must be done/bye after confirmation",
  ).toBe(true);
});

test("playoff button appears and generates a seeded single-elim bracket", async ({
  page,
}) => {
  const id = fixtureId;

  // Organizer views the bracket page after all group matches are confirmed.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);

  // "Playoffs auslosen" button must be visible since group stage is complete
  // and the playoff has not yet been generated.
  const playoffBtn = page.getByRole("button", { name: /Playoffs auslosen/i });
  await expect(playoffBtn).toBeVisible();
  await playoffBtn.click();

  // After clicking, the "Playoffs" section heading appears (the single-elim
  // bracket section). Exact match: the tournament name ("GroupsPlayoffs Test …")
  // and the "Gruppen → Playoffs" subtitle also contain the word "Playoffs".
  await expect(page.getByText("Playoffs", { exact: true })).toBeVisible();

  // The playoff button must no longer be visible — playoffs are now generated.
  await expect(
    page.getByRole("button", { name: /Playoffs auslosen/i }),
  ).not.toBeVisible();
});
