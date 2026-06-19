// Shared e2e helpers for the live-Supabase Playwright specs.
//
// All specs run against the LIVE hosted backend (no test DB). These helpers
// centralize the fixture lifecycle that every organizer/format spec needs, so a
// change to the RLS contract (e.g. org-scoped writes) or the registration flow
// lives in ONE place instead of being copy-pasted across ~8 spec files.
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const ORG_EMAIL = process.env.E2E_ORG_EMAIL;
export const ORG_PASSWORD = process.env.E2E_ORG_PASSWORD;

/** True when organizer creds are configured; specs `test.skip` on its negation. */
export const hasOrgCreds = Boolean(ORG_EMAIL && ORG_PASSWORD);

/** Assert the public Supabase env is present (call once in a spec's beforeAll). */
export function expectSupabaseEnv(): void {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );
}

/**
 * Sign in as the organizer and return a staff-scoped Supabase client. Used to
 * create/seed/delete fixture tournaments and to confirm results.
 */
export async function staffClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({
    email: ORG_EMAIL!,
    password: ORG_PASSWORD!,
  });
  if (error) throw new Error(`organizer sign-in failed: ${error.message}`);
  return client;
}

/** Resolve the Valorant game id (the game the format fixtures use). */
export async function getValorantGameId(client: SupabaseClient): Promise<string> {
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
export async function getOrgId(client: SupabaseClient): Promise<string> {
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
export interface FixtureParticipant {
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
 * participant can later act as themselves (e.g. report_match).
 */
export async function registerAndCheckIn(
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

/** A generated bracket match with both participant slots resolved. */
export interface FinalMatch {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
}

/** Resolve the single generated match (the 2-entrant final) with both slots. */
export async function getSingleFinal(
  client: SupabaseClient,
  tournamentId: string,
): Promise<FinalMatch> {
  const { data, error } = await client
    .from("matches")
    .select("id, participant_a_id, participant_b_id")
    .eq("tournament_id", tournamentId)
    .not("participant_a_id", "is", null)
    .not("participant_b_id", "is", null)
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(
      `final match not found: ${error?.message ?? "none with both slots"}`,
    );
  }
  return {
    id: data.id as string,
    participant_a_id: data.participant_a_id as string,
    participant_b_id: data.participant_b_id as string,
  };
}

/** Log in as the organizer through the UI (default `page` context). */
export async function loginAsOrganizer(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).first().fill(ORG_EMAIL!);
  await page.getByLabel(/passwort|password/i).fill(ORG_PASSWORD!);
  await page.getByRole("button", { name: /anmelden/i }).first().click();
  await expect(page).toHaveURL(/\/organizer/);
}

/**
 * Create a throwaway fixture tournament owned by the organizer's org, in
 * `registration` status. Returns its id. The caller deletes it in afterAll
 * (cascades to participants / matches / consents / reports).
 */
export async function createFixtureTournament(
  staff: SupabaseClient,
  opts: { format: string; namePrefix: string; mode?: string },
): Promise<string> {
  const gameId = await getValorantGameId(staff);
  const orgId = await getOrgId(staff);
  const name = `${opts.namePrefix} ${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}`;
  const { data, error } = await staff
    .from("tournaments")
    .insert({
      name,
      game_id: gameId,
      org_id: orgId,
      format: opts.format,
      mode: opts.mode ?? "hybrid",
      status: "registration",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      `fixture tournament insert failed: ${error?.message ?? "none"}`,
    );
  }
  return data.id as string;
}
