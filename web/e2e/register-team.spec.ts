// Zwei Menschen, ein Team — der Weg, um den es beim Person/Team-Umbau ging.
//
// Bisher gab es dafuer keinen Lauf. Die Registrierungs-Specs nahmen sich das
// erstbeste offene Turnier und konnten deshalb gar nicht wissen, ob sie ein
// Einzel- oder ein Teamturnier vor sich haben; sie nahmen den Ausgang "noch kein
// Team". Mit einem eigenen Turnier steht team_size fest, und der Team-Schritt
// laesst sich zum ersten Mal wirklich pruefen.
//
// Geprueft wird die Kette, an der ein Turniertag haengt: einer gruendet und
// bekommt einen Code, der zweite tippt genau diesen Code und landet danach im
// selben Team — mit dem Gruender als Captain. Beide brauchen eine eigene anonyme
// Sitzung, deshalb zwei Browser-Kontexte; im selben Kontext waere es derselbe
// Auth-User, und `unique (tournament_id, user_id)` wuerde die zweite Anmeldung
// ablehnen.
import { test, expect } from "@playwright/test";
import {
  hasOrgCreds,
  withFixtureTournament,
  staffClient,
  completeTeamStep,
  fillRegistrationForm,
} from "./fixtures";

test.skip(!hasOrgCreds, "organizer creds not configured");

const tournamentId = withFixtureTournament({
  namePrefix: "E2E Team",
  teamSize: 3,
});

test("one player founds a team, the other joins it with the code", async ({
  browser,
}) => {
  const id = tournamentId();

  const founderCtx = await browser.newContext();
  const joinerCtx = await browser.newContext();
  try {
    // (1) Gruender: anmelden, Fotoerlaubnis ueberspringen, Team gruenden.
    const founder = await founderCtx.newPage();
    await founder.goto(`/t/${id}/register`);
    const founderName = `E2E Founder ${Date.now()}`;
    await fillRegistrationForm(founder, {
      displayName: founderName,
      birthdate: "2000-01-01",
    });
    await founder
      .getByRole("button", { name: /ohne fotoerlaubnis fortfahren/i })
      .click();

    const teamName = `E2E Team ${Date.now()}`;
    const code = await completeTeamStep(founder, teamName);
    expect(code, "Team gruenden muss einen Beitritts-Code liefern").toBeTruthy();
    // Sechs Zeichen aus einem Alphabet ohne I, O, 0 und 1 — der Code wird
    // abgelesen und weitergesagt.
    expect(code!).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    await expect(founder.getByText(/anmeldung abgeschlossen/i)).toBeVisible();

    // (2) Zweiter Spieler, eigener Kontext: anmelden und mit dem Code beitreten.
    const joiner = await joinerCtx.newPage();
    await joiner.goto(`/t/${id}/register`);
    const joinerName = `E2E Joiner ${Date.now()}`;
    await fillRegistrationForm(joiner, {
      displayName: joinerName,
      birthdate: "2000-01-01",
    });
    await joiner
      .getByRole("button", { name: /ohne fotoerlaubnis fortfahren/i })
      .click();

    // Kleingeschrieben eingetippt: der Vergleich in der Datenbank laeuft ueber
    // upper(), Gross- und Kleinschreibung darf niemanden aussperren.
    await joiner.getByLabel("Team-Code").fill(code!.toLowerCase());
    await joiner.getByRole("button", { name: /^team beitreten$/i }).click();

    // Beide stehen jetzt in derselben Mannschaft, und der Gruender fuehrt sie.
    await expect(joiner.getByText(teamName, { exact: false })).toBeVisible();
    await expect(joiner.getByText(founderName, { exact: false })).toBeVisible();
    await expect(joiner.getByText(joinerName, { exact: false })).toBeVisible();

    // (3) Gegenprobe in der Datenbank — die Oberflaeche kann sich irren, die
    // Zeilen nicht. Erwartet: eine Team-Zeile, zwei Personen daran, der
    // Gruender als Captain. Und ausdruecklich KEINE der drei Personen-Zeilen
    // als eigener Wettkaempfer, sonst stuenden sie einzeln im Turnierbaum.
    const staff = await staffClient();
    const { data: rows, error } = await staff
      .from("participants")
      .select("id, display_name, type, team_id, is_captain, join_code")
      .eq("tournament_id", id);
    if (error) throw new Error(`participants read failed: ${error.message}`);

    const teams = (rows ?? []).filter((r) => r.type === "team");
    const players = (rows ?? []).filter((r) => r.type === "player");
    expect(teams).toHaveLength(1);
    expect(players).toHaveLength(2);
    expect(teams[0].display_name).toBe(teamName);
    expect(teams[0].join_code).toBe(code);

    for (const p of players) {
      expect(p.team_id).toBe(teams[0].id);
    }
    const captains = players.filter((p) => p.is_captain);
    expect(captains).toHaveLength(1);
    expect(captains[0].display_name).toBe(founderName);
  } finally {
    await founderCtx.close();
    await joinerCtx.close();
  }
});
