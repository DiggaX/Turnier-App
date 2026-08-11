/**
 * Der Riegel dieses Workstreams sitzt nicht im Text, sondern in der Verdrahtung:
 * gibt es Uebergangene, muss der Dialog ihre Namen zeigen und der Knopf am
 * Haekchen haengen. Ein Dialog, den man ohne Haekchen bestaetigen kann, haette
 * den Vorfall (zwoelf eingecheckte Kinder ohne Match) nicht verhindert.
 *
 * Gegenprobe zum anderen Ende: ohne Warnung und ohne bestehendes Bracket darf
 * gar kein Dialog kommen — sonst zahlt jeder normale Turnierstart fuer den
 * Sonderfall.
 *
 * Gemockt wird nur, was jsdom nicht hat: die Server-Action (sonst zoege der
 * Import den Supabase-Server-Client mit) und der Router. `fireEvent` statt
 * user-event, weil das Paket hier nicht installiert ist und ein Klick keins
 * braucht.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

// Die Signatur steht am Mock selbst, nicht nur an der Fassade darunter: vi.fn
// liest sie aus der Implementierung, und eine parameterlose macht schon den
// Durchreicher mit (id, options) zum Typfehler.
const generateBracket = vi.fn<
  (id: string, options?: { discardResults?: boolean }) => Promise<{ ok: true }>
>(async () => ({ ok: true }));
const refresh = vi.fn();

vi.mock("./actions", () => ({
  generateBracket: (id: string, options?: { discardResults?: boolean }) =>
    generateBracket(id, options),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { GenerateButton } from "./generate-button";

beforeEach(() => {
  generateBracket.mockClear();
  refresh.mockClear();
});

describe("GenerateButton", () => {
  it("names who stays out and keeps the confirm locked until it is acked", async () => {
    render(
      <GenerateButton
        tournamentId="t1"
        orphanNames={["Anna", "Ben"]}
        notReadyTeamNames={["Team Alpha"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generieren" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Anna, Ben");
    expect(dialog).toHaveTextContent("Team Alpha");

    const confirm = within(dialog).getByRole("button", { name: "Generieren" });
    expect(confirm).toBeDisabled();

    fireEvent.click(confirm);
    expect(generateBracket).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("checkbox"));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(generateBracket).toHaveBeenCalledWith("t1", {
      discardResults: false,
    });
  });

  it("generates straight away when nobody is left out and nothing exists yet", () => {
    render(<GenerateButton tournamentId="t1" />);

    fireEvent.click(screen.getByRole("button", { name: "Generieren" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(generateBracket).toHaveBeenCalledWith("t1", {
      discardResults: false,
    });
  });
});
