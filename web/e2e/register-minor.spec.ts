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

test("minor registration + drawn signature photo consent", async ({ page }) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const id = await getOpenTournamentId();
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Minor ${Date.now()}`;
  await fillRegistrationForm(page, {
    displayName: displayName,
    birthdate: "2014-01-01",
  });

  // Photo consent step (minor -> signature path)
  const pad = page.getByRole("img", {
    name: /unterschrift des erziehungsberechtigten/i,
  });
  await expect(pad).toBeVisible();

  // Draw on the canvas with mouse events across its bounding box.
  const box = await pad.boundingBox();
  if (!box) throw new Error("Signature pad has no bounding box");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, {
    steps: 10,
  });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, {
    steps: 10,
  });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.4, {
    steps: 10,
  });
  await page.mouse.up();

  await page
    .getByLabel("Name des Erziehungsberechtigten")
    .fill("Erika Mustermann");
  await page.getByLabel("Wohnhaft (Anschrift)").fill("Teststraße 1, 23769 Fehmarn");

  const finishButton = page.getByRole("button", {
    name: /^fotoerlaubnis erteilen$/i,
  });
  await finishButton.click();

  // Teamturnier: hier laege der Team-Schritt. Diese Specs brauchen kein
  // Team, also der ehrliche Ausgang "noch kein Team".
  await completeTeamStep(page);

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();
});

/**
 * Der Punkt der ganzen Änderung: ohne Fotoerlaubnis — und für Minderjährige
 * damit ohne Eltern-Unterschrift — kommt man trotzdem durch die Anmeldung.
 */
test("minor registration without photo consent", async ({ page }) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const id = await getOpenTournamentId();
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E NoConsent ${Date.now()}`;
  await fillRegistrationForm(page, {
    displayName: displayName,
    birthdate: "2014-01-01",
  });

  await page
    .getByRole("button", { name: /ohne fotoerlaubnis fortfahren/i })
    .click();

  // Teamturnier: hier laege der Team-Schritt. Diese Specs brauchen kein
  // Team, also der ehrliche Ausgang "noch kein Team".
  await completeTeamStep(page);

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();
});
