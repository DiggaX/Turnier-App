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

test("minor registration + drawn signature consent", async ({ page }) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set").not.toBe(
    "",
  );

  const id = await getOpenTournamentId();
  await page.goto(`/t/${id}/register`);

  const displayName = `E2E Minor ${Date.now()}`;
  await page.getByLabel("Anzeigename").fill(displayName);
  await page.getByLabel("Geburtsdatum").fill("2014-01-01");

  const captain = page.getByLabel("Captain — Name");
  if (await captain.isVisible()) {
    await captain.fill(`${displayName} Captain`);
  }

  await page.getByRole("button", { name: /weiter zur einwilligung/i }).click();

  // Consent step (minor -> signature path)
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

  const finishButton = page.getByRole("button", {
    name: /einwilligung abschließen/i,
  });
  await finishButton.click();

  await expect(
    page.getByText(/anmeldung & einwilligung abgeschlossen/i),
  ).toBeVisible();
  await expect(page.getByText(displayName, { exact: false })).toBeVisible();
});
