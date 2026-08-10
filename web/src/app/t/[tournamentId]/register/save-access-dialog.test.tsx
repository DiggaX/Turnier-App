/**
 * The gate is only a gate as long as "Weiter" stays shut until the box is
 * ticked, and only humane as long as the raw link is on screen for devices
 * where share, clipboard and download all fail. Both are pinned here.
 *
 * QrActions is stubbed: it renders a QRCodeCanvas, which jsdom has no 2D
 * context for, and its buttons are not what this test is about.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/qr-actions", () => ({
  QrActions: () => <div data-testid="qr-actions" />,
  participantRecoveryUrl: (tournamentId: string, qrToken: string) =>
    `https://example.test/t/${tournamentId}/me?token=${qrToken}`,
}));

vi.mock("@/components/qr-code", () => ({
  QrCode: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

import { SaveAccessDialog } from "./save-access-dialog";

const onDone = vi.fn();

function renderDialog() {
  return render(
    <SaveAccessDialog tournamentId="t-1" qrToken="tok-1" onDone={onDone} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SaveAccessDialog", () => {
  it("keeps Weiter disabled until the box is ticked", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("lets the participant through once they confirm", () => {
    renderDialog();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Ich habe den QR-Code oder den Link gespeichert",
      }),
    );

    const weiter = screen.getByRole("button", { name: "Weiter" });
    expect(weiter).toBeEnabled();

    fireEvent.click(weiter);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows the recovery link as copyable text, so no device can trap the user", () => {
    renderDialog();
    expect(
      screen.getByText("https://example.test/t/t-1/me?token=tok-1"),
    ).toBeInTheDocument();
  });

  it("shows the QR itself, since screenshotting is how most people save it", () => {
    renderDialog();
    expect(
      screen.getByRole("img", { name: "Dein Check-in-QR" }),
    ).toBeInTheDocument();
  });
});
