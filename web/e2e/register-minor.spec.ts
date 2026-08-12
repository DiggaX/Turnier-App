import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  hasOrgCreds,
  staffClient,
  withFixtureTournament,
  fillRegistrationForm,
} from "./fixtures";

// Eigenes Wegwerf-Turnier: kein fremdes Turnier vollschreiben, und die
// Teamgroesse steht fest, statt vom Zufall abzuhaengen.
test.skip(!hasOrgCreds, "organizer creds not configured");
const tournamentId = withFixtureTournament({
  namePrefix: "E2E Minor",
  teamSize: 1,
});

// Der erste Test malt eine ECHTE Unterschrift in den privaten Bucket. Das
// Turnier-Delete des Fixtures cascadet nur DB-Zeilen — Storage-Objekte bleiben
// als Waisen liegen (genau die Quelle der Altlast aus HANDOVER §7.3), und der
// Bucket hat keine DELETE-Policy: nur die Service-Role kann loeschen.
//
// Pfade werden pro Test in afterEach eingesammelt (da existieren die
// consents-Zeilen garantiert noch — auf die Reihenfolge der afterAll-Hooks
// gegenueber dem Turnier-Delete des Fixtures verlaesst sich hier nichts) und
// erst am Ende geloescht. Ohne Service-Key wird uebersprungen; Rueckstaende
// holt `npm run cleanup:signatures` nach.
const signaturePaths: string[] = [];

test.afterEach(async () => {
  const staff = await staffClient();
  const { data, error } = await staff
    .from("consents")
    .select("signature_path, participants!inner(tournament_id)")
    .eq("participants.tournament_id", tournamentId())
    .not("signature_path", "is", null);
  if (error) {
    console.warn(`signature collect failed: ${error.message}`);
    return;
  }
  for (const row of data ?? []) {
    const p = row.signature_path as string | null;
    if (p && !signaturePaths.includes(p)) signaturePaths.push(p);
  }
});

test.afterAll(async () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceKey || signaturePaths.length === 0) return;
  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.storage
    .from("consent-signatures")
    .remove(signaturePaths);
  if (error) console.warn(`signature cleanup failed: ${error.message}`);
});

test("minor registration + drawn signature photo consent", async ({ page }) => {
  const id = tournamentId();
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

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();
});

/**
 * Der Punkt der ganzen Änderung: ohne Fotoerlaubnis — und für Minderjährige
 * damit ohne Eltern-Unterschrift — kommt man trotzdem durch die Anmeldung.
 */
test("minor registration without photo consent", async ({ page }) => {
  const id = tournamentId();
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E NoConsent ${Date.now()}`;
  await fillRegistrationForm(page, {
    displayName: displayName,
    birthdate: "2014-01-01",
  });

  await page
    .getByRole("button", { name: /ohne fotoerlaubnis fortfahren/i })
    .click();

  await expect(page.getByText(/anmeldung abgeschlossen/i)).toBeVisible();
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();
});
