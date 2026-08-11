import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { completeTeamStep, fillRegistrationForm } from "./fixtures";

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

test("station check-in from QR landing page", async ({ page }) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const id = await getOpenTournamentId();

  // Register a fresh anonymous solo adult participant (keeps anon session cookies).
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Station ${Date.now()}`;
  await fillRegistrationForm(page, {
    displayName: displayName,
    birthdate: "2000-01-01",
  });

  // Ohne Fotoerlaubnis weiter: der Check-in darf davon nicht abhängen.
  await page
    .getByRole("button", { name: /ohne fotoerlaubnis fortfahren/i })
    .click();

  // Teamturnier: hier laege der Team-Schritt. Diese Specs brauchen kein
  // Team, also der ehrliche Ausgang "noch kein Team".
  await completeTeamStep(page);

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();

  // Navigate to the station check-in URL (simulates scanning the station QR).
  await page.goto(`/t/${id}/checkin-station`);

  // The page should auto-check in and show the success message.
  await expect(
    page.getByText(/du bist eingecheckt/i),
  ).toBeVisible();
});
