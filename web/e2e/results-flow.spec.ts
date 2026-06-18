// End-to-end results flow against the live hosted Supabase: two solo adults
// report agreeing scores for a 2-entrant single-elim final, then the organizer
// confirms on the Matches tab and the match shows `done` with the winner.
//
// This spec is fully self-contained: it creates a throwaway fixture tournament
// (unique name, format='single_elim') with 2 programmatically registered +
// checked-in participants in `beforeAll`, drives the organizer bracket UI to
// seed + generate the single final, has each player report through the genuine
// `report_match` RPC (its own anon session, mirroring the /me report flow), and
// the organizer confirms via the Matches UI. `afterAll` deletes the tournament
// (cascades to participants / matches / consents / reports). It never touches
// any pre-existing tournament, so it is order-independent.
//
// Participants are set up programmatically (not via browser flows): the live
// backend rate-limits anonymous sign-ins per IP, and browser registrations are
// slow + flaky. Each participant gets its own anon supabase-js client (its own
// auth user) so the owner-scoped insert/consent/check_in/report_match RLS is
// satisfied exactly as the real participant flow does it. N=2 is the smallest
// set that yields a single final both players can report on.
//
// Advancement note: a 2-entrant single-elim has only the final, which has no
// `next_match`, so this spec does not exercise winner-advancement. The
// `confirm_match` advancement path is covered by double-elim.spec.ts plus the
// bracket link-resolution / bye-propagation unit tests (resolve-links.test.ts).
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

/**
 * Sign in as the organizer and return a staff-scoped Supabase client. Used to
 * create/seed/delete the fixture tournament.
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

/** A registered + checked-in fixture participant with its own anon session. */
interface FixtureParticipant {
  id: string;
  displayName: string;
  /** The participant's own anon client — used to report results as them. */
  client: SupabaseClient;
}

/**
 * Register a fresh anonymous solo adult participant for the fixture tournament
 * using its own anon client (its own auth user), then check them in online.
 * Mirrors the real participant flow's DB writes: participant row → consent row →
 * `check_in('online')` RPC. The returned client keeps the anon session so the
 * participant can later report their own result via `report_match`.
 */
async function registerAndCheckIn(
  tournamentId: string,
  displayName: string,
): Promise<FixtureParticipant> {
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

  return { id: participantId, displayName, client };
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
let participants: FixtureParticipant[] = [];

// Create a throwaway single_elim fixture tournament with exactly 2 checked-in
// players → a single 2-entrant final both can report on.
test.beforeAll(async () => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const staff = await staffClient();
  const gameId = await getValorantGameId(staff);
  const orgId = await getOrgId(staff);

  const name = `Results Test ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { data: t, error: tErr } = await staff
    .from("tournaments")
    .insert({
      name,
      game_id: gameId,
      org_id: orgId,
      format: "single_elim",
      mode: "hybrid",
      status: "registration",
    })
    .select("id")
    .single();
  if (tErr || !t) {
    throw new Error(`fixture tournament insert failed: ${tErr?.message ?? "none"}`);
  }
  fixtureId = t.id as string;

  // 2 checked-in participants → a clean single-final single-elim bracket.
  participants = [];
  for (let i = 1; i <= 2; i++) {
    participants.push(await registerAndCheckIn(fixtureId, `RF-P${i}`));
  }
});

// Always remove the fixture so nothing leaks into the shared backend; the
// delete cascades to participants / matches / consents / match_reports.
test.afterAll(async () => {
  if (!fixtureId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", fixtureId);
});

test("players report agreeing scores and the referee confirms the result", async ({
  page,
}) => {
  const id = fixtureId;
  const staff = await staffClient();

  // (1) Organizer seeds + generates the bracket (1 final match, both slots
  // filled) through the bracket UI.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${id}/bracket`);
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();
  await expect(page.getByTestId("bracket-view")).toBeVisible();

  // (2) Each participant reports agreeing scores via the genuine `report_match`
  // RPC from its own anon session (the same RPC the /me report UI calls). We
  // resolve each player's physical side and drive their own/opponent score so
  // both reports map to match-term score_a=2, score_b=1 — i.e. they agree on a
  // deterministic 2:1 (side A wins) no matter how seeding placed them.
  const { data: finalMatch, error: matchErr } = await staff
    .from("matches")
    .select("id, participant_a_id, participant_b_id")
    .eq("tournament_id", id)
    .not("participant_a_id", "is", null)
    .not("participant_b_id", "is", null)
    .limit(1)
    .single();
  if (matchErr || !finalMatch) {
    throw new Error(`final match not found: ${matchErr?.message ?? "none"}`);
  }
  for (const p of participants) {
    const side = finalMatch.participant_a_id === p.id ? "a" : "b";
    const myScore = side === "a" ? 2 : 1;
    const oppScore = side === "a" ? 1 : 2;
    const scoreA = side === "a" ? myScore : oppScore;
    const scoreB = side === "a" ? oppScore : myScore;
    const { error: reportErr } = await p.client.rpc("report_match", {
      p_match_id: finalMatch.id as string,
      p_score_a: scoreA,
      p_score_b: scoreB,
    });
    if (reportErr) {
      throw new Error(
        `report_match failed for ${p.displayName}: ${reportErr.message}`,
      );
    }
  }

  // (3) Organizer opens the matches page: both reports agree, so the "Einig"
  // badge shows the agreed score. Confirm and assert the match is done with a
  // winner. Seeding decides which physical side each player lands on, so assert
  // on the agreed score and the done state rather than a fixed side.
  await page.goto(`/organizer/tournaments/${id}/matches`);
  const einig = page.getByText(/✓\s*einig:\s*2:1/i);
  await expect(einig).toBeVisible();

  await page.getByRole("button", { name: /freigeben/i }).first().click();

  // After confirm: the match renders the final "X:Y · Sieger: <name>" line.
  const finalLine = page.getByText(/2:1\s*·\s*sieger:/i);
  await expect(finalLine).toBeVisible();

  // The winner is one of our two registered players.
  const winnerText = (await finalLine.textContent()) ?? "";
  expect(
    participants.some((p) => winnerText.includes(p.displayName)),
  ).toBe(true);
});
