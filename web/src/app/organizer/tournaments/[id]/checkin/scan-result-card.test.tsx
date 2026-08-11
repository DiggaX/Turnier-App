/**
 * Die Karte verschwindet nach vier Sekunden von allein — ausser sie wartet auf
 * eine Entscheidung. Genau das wird hier festgenagelt.
 *
 * Warum dieser Test und nicht die Wortlaute (die stehen in scan-result-card.test.ts):
 * die Pause ist EINE Zeile im Countdown-Effect. Fällt sie weg, ist nichts rot,
 * nichts wirft, und der Fehler zeigt sich erst am Tresen — die Übernahme-Karte
 * verschwindet unter dem Daumen, während jemand noch überlegt, und der Scan
 * muss von vorn. Lautlose Regression, teurer Moment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ScanResultCard, type ScanStatus } from "./scan-result-card";

const OFFER: ScanStatus = {
  kind: "carryOverOffer",
  name: "Lena Fuchs",
  tournament: "Mission: Next Level EA Sports 2026",
  token: "24ae04a7-bbe4-403c-b925-6e9f7afecc26",
};

const onExpire = vi.fn();

function renderCard(status: ScanStatus, actions?: React.ReactNode) {
  return render(
    <ScanResultCard
      status={status}
      nonce={1}
      onExpire={onExpire}
      actions={actions}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScanResultCard", () => {
  it("lässt eine offene Übernahme stehen, statt sie wegzuzählen", () => {
    renderCard(OFFER);

    vi.advanceTimersByTime(10_000);

    expect(onExpire).not.toHaveBeenCalled();
  });

  it("zählt alle anderen Karten weiterhin ab", () => {
    renderCard({ kind: "carriedOver", name: "Lena Fuchs" });

    vi.advanceTimersByTime(4_100);

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("zeigt bei einer offenen Frage keinen ablaufenden Balken", () => {
    const { container } = renderCard(OFFER);

    // Der Balken ist das einzige Element mit der Countdown-Animation.
    const bars = container.querySelectorAll('[style*="scan-countdown"]');
    expect(bars).toHaveLength(0);
  });

  /**
   * Die Knöpfe liegen im Overlay über dem Kamerabild, dessen Container auf
   * pointer-events-none steht. Ohne pointer-events-auto auf der Leiste sind sie
   * sichtbar und trotzdem tot — im Test durch einen echten Klick abgesichert.
   */
  it("macht die Knöpfe anklickbar", () => {
    const onClick = vi.fn();
    renderCard(
      OFFER,
      <button type="button" onClick={onClick}>
        Übernehmen
      </button>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
