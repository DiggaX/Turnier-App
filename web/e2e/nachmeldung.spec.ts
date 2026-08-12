// Tresen-Nachmeldung im Team-Turnier (§7.17-Rest) — und nebenbei der Beweis
// fuer §7.16: das Aufstellungs-Formular war bis hier NIE in einem Browser
// geoeffnet. Unit- und Komponententests kannten es, aber kein echter Klick.
//
// Zwei VERKETTETE Tests auf einem 3v3-Fixture: Test 1 meldet ein Team mit zwei
// von drei Spielern nach (die leere dritte Zeile muss gefiltert werden), Test 2
// meldet den dritten Menschen als Einzelspieler nach und ordnet ihn ueber die
// Auswahl direkt diesem Team zu. Die Reihenfolge traegt: playwright.config hat
// workers: 1, und serial macht die Abhaengigkeit explizit — faellt Test 1,
// wird Test 2 uebersprungen statt raetselhaft rot.
import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  withFixtureTournament,
  loginAsOrganizer,
  fillBirthdate,
  staffClient,
} from "./fixtures";

test.skip(!hasOrgCreds, "organizer creds not configured");
test.describe.configure({ mode: "serial" });

const tournamentId = withFixtureTournament({
  namePrefix: "E2E Nachmeldung",
  teamSize: 3,
});

// Modul-Konstanten mit Zeitstempel: Test 2 muss die Namen aus Test 1 kennen,
// und parallele Laeufe gegen das Live-Backend duerfen nicht kollidieren.
const STAMP = Date.now();
const teamName = `E2E Nachmeldung Team ${STAMP}`;
const captainName = `E2E Nachmeldung Anna ${STAMP}`;
const playerTwoName = `E2E Nachmeldung Ben ${STAMP}`;
const playerThreeName = `E2E Nachmeldung Cem ${STAMP}`;

test("Team nachmelden zeigt die 3v3-Aufstellung und filtert leere Zeilen", async ({
  page,
}) => {
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${tournamentId()}/participants`);

  // Mit ^$ verankert: /nachmelden/i traefe auch „Einzelspieler nachmelden".
  await page.getByRole("button", { name: /^Team nachmelden$/ }).click();

  // §7.16-Kern: die Aufstellung steht wirklich im offenen Formular. exact: true
  // bei den Spieler-Labels, weil „Gamertag Captain (optional)" usw. die
  // Substring-Variante mit-matchen wuerden.
  await expect(page.getByText("Aufstellung · 3v3")).toBeVisible();
  await expect(page.getByLabel("Captain", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Spieler 2 (optional)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Spieler 3 (optional)", { exact: true }),
  ).toBeVisible();
  // 3v3 heisst DREI Zeilen — eine vierte darf es nicht geben. Das Regex faengt
  // sowohl „Spieler 4 (optional)" als auch „Gamertag Spieler 4 (optional)".
  await expect(page.getByLabel(/Spieler 4/)).toHaveCount(0);

  await page.getByLabel("Teamname").fill(teamName);
  // fillBirthdate matcht per Substring auch „Geburtsdatum Captain" — deshalb
  // hier KEIN exact-Umbau am Helper noetig.
  await fillBirthdate(page, "2013-04-10");
  await page.getByLabel("Captain", { exact: true }).fill(captainName);
  await page
    .getByLabel("Spieler 2 (optional)", { exact: true })
    .fill(playerTwoName);
  // Zeile 3 bleibt LEER — genau diese Blank-Zeile muss die Action filtern,
  // sonst entstuende ein Geist-Spieler ohne Namen.

  await page.getByRole("button", { name: "Anlegen & einchecken" }).click();
  await expect(page.getByRole("status")).toContainText(
    `${teamName} wurde angelegt und eingecheckt`,
  );

  // Auf die Team-Zeile gescoped, nicht global: „2 / 3" koennte irgendwann auch
  // anderswo auf der Seite stehen.
  const teamRow = page.getByRole("row", { name: teamName });
  await expect(teamRow).toContainText("2 / 3");
});

test("Einzelspieler nachmelden landet per Auswahl direkt im Team", async ({
  page,
}) => {
  await loginAsOrganizer(page);
  // Eigener Test = frischer Browser-Kontext, das Formular ist wieder ZU — der
  // Einzel-Trigger oeffnet es direkt im richtigen Modus.
  await page.goto(`/organizer/tournaments/${tournamentId()}/participants`);
  await page.getByRole("button", { name: /^Einzelspieler nachmelden$/ }).click();

  // Der Umschalter existiert und der Einzelmodus ist wirklich gedrueckt —
  // aria-pressed, nicht nur Farbe (vorlesen laesst sich Farbe nicht).
  const modes = page.getByRole("group", { name: "Was wird nachgemeldet" });
  await expect(
    modes.getByRole("button", { name: "Einzelspieler nachmelden" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Anzeigename").fill(playerThreeName);
  await fillBirthdate(page, "2012-06-05");

  // Natives <select>: selectOption({ label }) verlangt den EXAKTEN Optionstext,
  // der an der Belegungs-Formatierung „(2/3)" haengt. Robuster: die Option ueber
  // den Teamnamen finden, die Belegung als Assertion pruefen und dann ueber
  // ihren value (die Team-Id) auswaehlen — so bricht der Test nicht, wenn die
  // Formatierung sich mal aendert, ohne dass die 2/3-Pruefung verloren geht.
  const teamSelect = page.getByLabel("Direkt in Team (optional)");
  const teamOption = teamSelect.locator("option", { hasText: teamName });
  await expect(teamOption).toContainText("(2/3)");
  const teamValue = await teamOption.getAttribute("value");
  await teamSelect.selectOption(teamValue!);

  await page.getByRole("button", { name: "Anlegen & einchecken" }).click();
  await expect(page.getByRole("status")).toContainText(
    `${playerThreeName} wurde angelegt und eingecheckt`,
  );

  // Die Team-Zeile ist jetzt voll — und der neue Spieler taucht NICHT als
  // eigene Listenzeile auf, weil er ein Team hat.
  await expect(page.getByRole("row", { name: teamName })).toContainText("3 / 3");

  // Detailseite: ul mit einem li pro Mitglied, Captain-Chip nur beim Captain
  // (participants/[pid]/page.tsx). Auf die Spieler-Section gescoped.
  await page.getByRole("link", { name: teamName }).click();
  const rosterSection = page.locator("section", {
    has: page.getByRole("heading", { name: "Spieler", exact: true }),
  });
  await expect(rosterSection).toContainText("3 / 3");
  await expect(rosterSection.getByRole("listitem")).toHaveCount(3);
  // exact: true — die Spielernamen enthalten das Wort nicht, und der Chip-Text
  // ist genau „Captain".
  await expect(
    rosterSection.getByText("Captain", { exact: true }),
  ).toHaveCount(1);

  // Gegenprobe in der Datenbank — die Oberflaeche kann sich irren, die Zeilen
  // nicht: drei Spieler am selben Team, genau ein Captain, eine Team-Zeile.
  const staff = await staffClient();
  const { data: rows, error } = await staff
    .from("participants")
    .select("id, display_name, type, team_id, is_captain")
    .eq("tournament_id", tournamentId())
    .in("display_name", [captainName, playerTwoName, playerThreeName, teamName]);
  if (error) throw new Error(`participants read failed: ${error.message}`);

  const teams = (rows ?? []).filter((r) => r.type === "team");
  const players = (rows ?? []).filter((r) => r.type === "player");
  expect(teams).toHaveLength(1);
  expect(players).toHaveLength(3);
  for (const p of players) {
    expect(p.team_id).toBe(teams[0].id);
  }
  const captains = players.filter((p) => p.is_captain);
  expect(captains).toHaveLength(1);
  expect(captains[0].display_name).toBe(captainName);
});
