// Carry-over at the door (§5.1 HANDOVER): scanning a QR from a PREVIOUS
// tournament offers to carry the person over into THIS one.
//
// This spec is the browser-side counterpart to the rolled-back-transaction DB
// proofs — it drives the real scanner page through the hardware-scan capture
// field (no camera needed) and pins the one run that counts: the SAME old QR
// scanned twice must not create a second participants row.
//
// Documented behavior, not a bug (HANDOVER §7.38): the second scan shows the
// carry-over OFFER again — the old QR still points at the old row, and the
// client never reads `created=false`. Idempotency lives in the DB
// (`on conflict do nothing`), so the proof is a row count, not a UI text.
import { test, expect } from "@playwright/test";
import {
  createFixtureTournament,
  getOrgId,
  hasOrgCreds,
  loginAsOrganizer,
  registerAndCheckIn,
  staffClient,
  withFixtureTournament,
} from "./fixtures";

test.skip(!hasOrgCreds, "E2E_ORG_EMAIL/E2E_ORG_PASSWORD not set");

// Target tournament (registration status) — where the person gets carried INTO.
const targetId = withFixtureTournament({ namePrefix: "E2E CarryOver Ziel" });

// Source tournament + participant live in this spec's own beforeAll because
// withFixtureTournament can only manage one tournament per file.
let sourceId = "";
let qrToken = "";
const personName = `E2E Carry Lena ${Date.now()}`;

test.beforeAll(async () => {
  const staff = await staffClient();
  sourceId = await createFixtureTournament(staff, {
    format: "single_elim",
    namePrefix: "E2E CarryOver Quelle",
  });

  // The org switch must be ON before the scanner page loads — the page caches
  // it for its whole lifetime. Rene's decision (2026-08-12): the switch stays
  // on permanently; setting it here just makes the spec immune to someone
  // flipping it off. No restore.
  const orgId = await getOrgId(staff);
  const { error } = await staff
    .from("organizations")
    .update({ allow_carry_over: true })
    .eq("id", orgId);
  if (error) throw new Error(`allow_carry_over update failed: ${error.message}`);

  // Account-holding solo participant in the SOURCE tournament — exactly the
  // shape carry_over_participant accepts (user_id set, type solo, birthdate).
  const person = await registerAndCheckIn(sourceId, personName);
  qrToken = person.qrToken;
});

test.afterAll(async () => {
  if (!sourceId) return;
  const staff = await staffClient();
  await staff.from("tournaments").delete().eq("id", sourceId);
});

/** Type a token into the hidden hardware-scan capture field, like a wedge scanner. */
async function scan(page: import("@playwright/test").Page, token: string) {
  const capture = page.locator("[data-scan-capture]");
  await capture.fill(token);
  await capture.press("Enter");
}

test("old QR scanned twice carries over exactly once", async ({ page }) => {
  test.setTimeout(60_000);

  // Hardware mode keeps the camera <Scanner> unmounted — headless has no
  // camera and would paint the error block. The capture field exists either way.
  await page.addInitScript(() => {
    window.localStorage.setItem("turnierapp.checkin.scanMode", "hardware");
  });

  await loginAsOrganizer(page);
  await page.goto(`/organizer/tournaments/${targetId()}/checkin`);

  // Scan 1: the old QR is recognized as another tournament's participant with
  // an account → the carry-over offer appears (no countdown while it waits).
  await scan(page, qrToken);
  await expect(page.getByText("In dieses Turnier übernehmen?")).toBeVisible();
  await expect(page.getByText(personName)).toBeVisible();

  await page.getByRole("button", { name: "Übernehmen & einchecken" }).click();
  await expect(page.getByText("Übernommen und eingecheckt")).toBeVisible();

  // Scan 2, same token: the offer appears AGAIN (documented, §7.38) — confirm
  // again to prove the write path is idempotent end-to-end.
  await scan(page, qrToken);
  await expect(page.getByText("In dieses Turnier übernehmen?")).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen & einchecken" }).click();
  await expect(page.getByText("Übernommen und eingecheckt")).toBeVisible();

  // THE proof (§7.19): exactly one row in the target tournament, checked in.
  const staff = await staffClient();
  const { data: rows, error } = await staff
    .from("participants")
    .select("id, checked_in_at")
    .eq("tournament_id", targetId())
    .eq("display_name", personName);
  if (error) throw new Error(`proof query failed: ${error.message}`);
  expect(rows).toHaveLength(1);
  expect(rows![0].checked_in_at).not.toBeNull();
});
