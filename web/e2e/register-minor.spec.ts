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

  // Auf dem Feld unterschreiben.
  //
  // Die Zeigerereignisse werden direkt auf dem Canvas ausgeloest statt ueber
  // page.mouse: dessen Koordinaten sind fensterbezogen, das Feld liegt weit
  // unten auf einer langen Seite, und zwischen boundingBox() und dem ersten
  // Klick kann sich die Seite noch verschieben — dann landet der Strich neben
  // dem Feld und der Lauf scheitert spaeter mit "Bitte unterschreiben", ohne
  // dass irgendwo steht, warum. Hier wird aus dem Rechteck des Elements
  // gerechnet, das kann nicht danebengehen.
  await pad.evaluate((canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    const at = (fx: number, fy: number) => ({
      clientX: r.left + r.width * fx,
      clientY: r.top + r.height * fy,
    });
    const fire = (type: string, fx: number, fy: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          buttons: type === "pointerup" ? 0 : 1,
          ...at(fx, fy),
        }),
      );
    fire("pointerdown", 0.2, 0.5);
    for (let i = 1; i <= 10; i++) fire("pointermove", 0.2 + i * 0.06, 0.5 - i * 0.02);
    fire("pointerup", 0.8, 0.3);
  });

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
