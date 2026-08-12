// Live-Steuerung in der Orga-Matchliste (§7.17 HANDOVER): ein Event OHNE
// Scorekeeper-Handy komplett vom Orga-Bildschirm fahren — starten → zählen →
// beenden → Freigabe → done. Alles läuft über dieselben SECURITY-DEFINER-RPCs
// wie die /score/[token]-Seite; die Orga bekommt hier kein Extra-Privileg,
// nur denselben Token auf einem Bildschirm, den sie ohnehin hält.
//
// Locator-Fallen dieser Seite:
//  - Der Text "Scorekeeper" steht ZWEIMAL da (QR-Block-Span + SectionLabel im
//    Control) — nie unscoped benutzen.
//  - <output> hat implizit role=status, und die done-Zeile ist ebenfalls
//    role=status — getByRole("status") global trifft mehrfach; immer scopen
//    bzw. per hasText filtern.
import { test, expect } from "@playwright/test";
import {
  getSingleFinal,
  hasOrgCreds,
  loginAsOrganizer,
  registerAndCheckIn,
  staffClient,
  withFixtureTournament,
  type FixtureParticipant,
} from "./fixtures";

test.skip(!hasOrgCreds, "organizer creds not configured");
const tournamentId = withFixtureTournament({ namePrefix: "E2E LiveControl" });

// Namen als Konstanten: die Plus-Buttons werden über das aria-label
// "<Name>: ein Tor hinzufügen" angesteuert, also müssen die Namen im Test
// exakt bekannt sein.
const SUFFIX = Date.now();
const ANNA = `E2E LC Anna ${SUFFIX}`;
const BEN = `E2E LC Ben ${SUFFIX}`;

let anna: FixtureParticipant;

test.beforeAll(async () => {
  anna = await registerAndCheckIn(tournamentId(), ANNA);
  await registerAndCheckIn(tournamentId(), BEN);
});

test("orga steuert ein Match live: starten, zählen, beenden, freigeben", async ({
  page,
}) => {
  // ~8 RPC-Roundtrips + doppelte router.refresh-Wellen (MatchesRealtime UND
  // der onChange des Controls feuern beide) — großzügiges Budget.
  test.setTimeout(90_000);

  // (1) Bracket über die UI-Kette erzeugen. generateBracket setzt das Turnier
  // dabei nebenbei auf running.
  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${tournamentId()}/bracket`);
  await page.getByRole("button", { name: /zufällig setzen/i }).click();
  await page.getByRole("button", { name: /seeding speichern/i }).click();
  await expect(page.getByText(/gespeichert/i)).toBeVisible();
  await page.getByRole("button", { name: /^generieren$/i }).click();
  await expect(page.getByTestId("bracket-view")).toBeVisible();

  // Welcher Name auf Seite A steht, ist nach dem Zufalls-Seeding unbestimmt —
  // erst die Slots holen und auf Namen mappen, dann deterministisch A 2× und
  // B 1× klicken und 2:1 asserten.
  const staff = await staffClient();
  const final = await getSingleFinal(staff, tournamentId());
  const aSideName = final.participant_a_id === anna.id ? ANNA : BEN;
  const bSideName = aSideName === ANNA ? BEN : ANNA;

  // (2) Orga-Matchliste.
  await page.goto(`/organizer/tournaments/${tournamentId()}/matches`);

  // Die LiveScoreControl-<section>: von den Sections mit dem exakten Text
  // "Scorekeeper" ist die äußere "Ergebnisse"-Section ein Ancestor und kommt
  // in DOM-Reihenfolge zuerst — .last() ist das Control selbst.
  const control = page
    .locator("section")
    .filter({ has: page.getByText("Scorekeeper", { exact: true }) })
    .last();

  // (3) Match ist pending → das Control ist eingeklappt (auto-expand gilt nur
  // bei live + Mount), also erst aufklappen.
  await page.getByRole("button", { name: /selbst steuern/i }).click();

  // (4) Starten → Live-Pill.
  await control.getByRole("button", { name: /spiel starten/i }).click();
  await expect(control.getByText("Live", { exact: true })).toBeVisible();

  // (5) Zählen: Seite A zweimal, Seite B einmal → 2:1. Playwright wartet die
  // disabled-Phasen (saving) zwischen den Klicks von selbst ab.
  const plusA = control.getByRole("button", {
    name: `${aSideName}: ein Tor hinzufügen`,
  });
  const plusB = control.getByRole("button", {
    name: `${bSideName}: ein Tor hinzufügen`,
  });
  await plusA.click();
  await plusA.click();
  await plusB.click();

  // (6) Beenden → Warten-auf-Freigabe-Box mit dem Endstand, gescopet auf die
  // Section (NICHT getByRole("status") global — mehrere Treffer, s.o.).
  await control.getByRole("button", { name: /spiel beenden/i }).click();
  await expect(control.getByText("Wartet auf Freigabe")).toBeVisible();
  await expect(control.getByText("2:1")).toBeVisible();

  // (7) Reload ist PFLICHT: der Scorekeeper-Vorschlag füllt die
  // Freigabe-Inputs nur beim Mount (useState(defaultScoreA…) in
  // confirm-form.tsx). router.refresh() erhält den Client-State — ohne Reload
  // bleiben die Inputs leer und Freigeben scheitert an der Validierung.
  await page.reload();

  // (8) Vorschlag sichtbar (ASCII-Bindestrich + "pruefen" ohne Umlaut — so
  // steht es im Quelltext) und die Inputs sind vorbefüllt.
  await expect(
    page.getByText("Scorekeeper-Vorschlag - bitte pruefen"),
  ).toBeVisible();
  await expect(page.getByLabel(`Score ${aSideName}`)).toHaveValue("2");
  await expect(page.getByLabel(`Score ${bSideName}`)).toHaveValue("1");
  await page.getByRole("button", { name: /^freigeben$/i }).click();

  // (9) Done: Ergebniszeile mit Sieger (Seite A hat 2:1 gewonnen), und das
  // done-Gate entfernt die Selbststeuerung komplett.
  const resultLine = page
    .getByRole("status")
    .filter({ hasText: /2:1\s*·\s*sieger:/i });
  await expect(resultLine).toBeVisible();
  expect((await resultLine.textContent()) ?? "").toContain(aSideName);
  await expect(
    page.getByRole("button", { name: /selbst steuern/i }),
  ).toHaveCount(0);
});
