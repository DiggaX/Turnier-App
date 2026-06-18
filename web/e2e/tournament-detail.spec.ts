import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function getOpenTournament(): Promise<{
  id: string;
  name: string;
  slug: string;
}> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, organizations(slug)")
    .eq("status", "registration")
    .limit(1)
    .single();
  if (error || !data) {
    throw new Error(
      `Could not load an open tournament: ${error?.message ?? "none found"}`,
    );
  }
  const org = data.organizations as { slug: string } | { slug: string }[] | null;
  const slug = Array.isArray(org) ? org[0]?.slug : org?.slug;
  if (!slug) {
    throw new Error("Open tournament has no organization slug");
  }
  return { id: data.id as string, name: data.name as string, slug };
}

test("tournament detail shows title, register CTA and phase stepper", async ({
  page,
}) => {
  expect(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be set").not.toBe("");
  expect(
    SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
  ).not.toBe("");

  const { id, name, slug } = await getOpenTournament();

  // Reach the detail page from the home → org directory → tournament "Details"
  // link. Tournament listings live on the org page (/o/<slug>) since the
  // multi-tenant refactor; home only lists organizations.
  await page.goto("/");
  await page.locator(`a[href="/o/${slug}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/o/${slug}$`));
  await page
    .locator(`a[href="/t/${id}"]`)
    .filter({ hasText: /details/i })
    .first()
    .click();

  await expect(page).toHaveURL(new RegExp(`/t/${id}$`));

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
