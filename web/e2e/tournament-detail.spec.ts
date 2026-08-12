import { test, expect } from "@playwright/test";
import { hasOrgCreds, staffClient, withFixtureTournament } from "./fixtures";

// Eigenes Wegwerf-Turnier statt "erstbestes Turnier in registration" aus der
// Produktions-DB — genau das Borgen fremder Daten, vor dem der Doc-Kommentar
// von withFixtureTournament warnt (und seit dem DB-Wipe gibt es ohnehin kein
// offenes Turnier mehr zu borgen).
test.skip(!hasOrgCreds, "E2E_ORG_EMAIL/E2E_ORG_PASSWORD not set");
const tournamentId = withFixtureTournament({ namePrefix: "E2E Detail" });

test("tournament detail shows title, register CTA and phase stepper", async ({
  page,
}) => {
  const id = tournamentId();

  // Name und Org-Slug direkt am eigenen Fixture-Turnier nachschlagen — nichts
  // hardcoden, die Spec kennt nur die Id.
  const staff = await staffClient();
  const { data, error } = await staff
    .from("tournaments")
    .select("name, organizations(slug)")
    .eq("id", id)
    .single();
  if (error || !data) {
    throw new Error(`Could not load fixture tournament: ${error?.message ?? "none"}`);
  }
  const name = data.name as string;
  const org = data.organizations as { slug: string } | { slug: string }[] | null;
  const slug = Array.isArray(org) ? org[0]?.slug : org?.slug;
  if (!slug) throw new Error("Fixture tournament has no organization slug");

  // Reach the detail page from the home → org directory → tournament "Details"
  // link. Tournament listings live on the org page (/o/<slug>) since the
  // multi-tenant refactor; home only lists organizations.
  await page.goto("/");
  await page.locator(`a[href="/o/${slug}"]`).first().click();
  // Match on the exact pathname rather than interpolating the slug into a RegExp
  // (organizations.slug has no format constraint, so a regex metachar in it would
  // change the match semantics or throw).
  await expect(page).toHaveURL((url) => url.pathname === `/o/${slug}`);
  await page
    .locator(`a[href="/t/${id}"]`)
    .filter({ hasText: /details/i })
    .first()
    .click();

  await expect(page).toHaveURL((url) => url.pathname === `/t/${id}`);

  // Title is visible.
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // "Jetzt anmelden" links to the register page (status: registration).
  const registerLink = page.getByRole("link", { name: /jetzt anmelden/i });
  await expect(registerLink).toBeVisible();
  await expect(registerLink).toHaveAttribute("href", `/t/${id}/register`);

  // Phase stepper marks "registration" as the current phase.
  const current = page.locator("[data-phase][data-current='true']");
  await expect(current).toHaveAttribute("data-phase", "registration");
  await expect(current).toHaveText("registration");
});
