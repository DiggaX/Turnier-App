import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function getOpenTournamentId(): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from("tournaments")
    .select("id")
    .eq("status", "registration")
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(
      `Could not load an open tournament: ${error?.message ?? "none found"}`,
    );
  }
  return data.id as string;
}

test("online check-in from participant status page", async ({ page }) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const id = await getOpenTournamentId();

  // Register a fresh anonymous solo adult participant (keeps anon session cookies).
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Checkin ${Date.now()}`;
  await page.getByLabel("Anzeigename").fill(displayName);
  await page.getByLabel("Geburtsdatum").fill("2000-01-01");

  // If the open tournament is team-based, a captain name is required.
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

  // The same context keeps the anon session, so /me resolves this participant.
  await page.goto(`/t/${id}/me`);
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();

  await page
    .getByRole("button", { name: /jetzt online einchecken/i })
    .click();

  await expect(page.getByText(/eingecheckt/i)).toBeVisible();
});
