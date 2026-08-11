/**
 * Das Feld ersetzt <input type="date">, gibt nach außen aber weiterhin genau
 * einen YYYY-MM-DD-String heraus. Getestet wird deshalb beides: die reine
 * Umrechnung und das Tippverhalten, an dem die Bedienung am Tresen hängt.
 *
 * Der teuerste Fall steht unten: leert der Elternwert sich (das Orga-Formular
 * tut das nach jedem angelegten Walk-in), müssen auch die Kästchen leer sein.
 * Sonst erbt der nächste Teilnehmer stillschweigend das Geburtsdatum des
 * vorigen — ein Fehler, den am Tresen niemand bemerkt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  BirthdateField,
  partsToIso,
  partsFromText,
} from "./birthdate-field";

const onChange = vi.fn();

function renderField(value = "") {
  return render(
    <BirthdateField id="bd" value={value} onChange={onChange} />,
  );
}

/** Elternkomponente, die den Wert wirklich hält — wie beide echten Formulare. */
function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <BirthdateField id="bd" value={value} onChange={setValue} />
      <output data-testid="iso">{value}</output>
      <button type="button" onClick={() => setValue("")}>
        zuruecksetzen
      </button>
    </>
  );
}

const day = () => screen.getByPlaceholderText("TT");
const month = () => screen.getByPlaceholderText("MM");
const year = () => screen.getByPlaceholderText("JJJJ");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("partsToIso", () => {
  it("baut den ISO-String und füllt einstellige Angaben auf", () => {
    expect(partsToIso({ day: "7", month: "4", year: "2013" })).toBe(
      "2013-04-07",
    );
  });

  it("gibt leer zurück, solange etwas fehlt", () => {
    expect(partsToIso({ day: "10", month: "04", year: "" })).toBe("");
    expect(partsToIso({ day: "10", month: "04", year: "201" })).toBe("");
    expect(partsToIso({ day: "", month: "04", year: "2013" })).toBe("");
  });
});

describe("partsFromText", () => {
  it("erkennt beide Schreibweisen", () => {
    expect(partsFromText("2013-04-10")).toEqual({
      day: "10",
      month: "04",
      year: "2013",
    });
    expect(partsFromText("10.4.2013")).toEqual({
      day: "10",
      month: "04",
      year: "2013",
    });
  });

  it("lehnt alles ab, was kein vollständiges Datum ist", () => {
    expect(partsFromText("10")).toBeNull();
    expect(partsFromText("10.04.")).toBeNull();
    expect(partsFromText("")).toBeNull();
  });
});

describe("BirthdateField", () => {
  it("springt nach zwei Ziffern weiter, ohne dass jemand klicken muss", () => {
    renderField();

    fireEvent.change(day(), { target: { value: "10" } });
    expect(document.activeElement).toBe(month());

    fireEvent.change(month(), { target: { value: "04" } });
    expect(document.activeElement).toBe(year());
  });

  it("meldet erst nach außen, wenn das Datum vollständig ist", () => {
    render(<Harness />);

    fireEvent.change(day(), { target: { value: "10" } });
    fireEvent.change(month(), { target: { value: "04" } });
    expect(screen.getByTestId("iso").textContent).toBe("");

    fireEvent.change(year(), { target: { value: "2013" } });
    expect(screen.getByTestId("iso").textContent).toBe("2013-04-10");
  });

  // Der Sprung ins nächste Feld löst ein blur aus, während die zweite Ziffer
  // noch nicht gerendert ist. Wurde dabei die erste Ziffer aufgefüllt, stand am
  // Ende "00" statt "05" — und zwar für jeden Monat und Tag unter dem zehnten.
  it("behält die führende Null, wenn der Fokus weiterspringt", () => {
    render(<Harness />);

    day().focus();
    fireEvent.change(day(), { target: { value: "0" } });
    fireEvent.change(day(), { target: { value: "05" } });
    fireEvent.change(month(), { target: { value: "0" } });
    fireEvent.change(month(), { target: { value: "05" } });
    fireEvent.change(year(), { target: { value: "2015" } });

    expect(day()).toHaveValue("05");
    expect(month()).toHaveValue("05");
    expect(screen.getByTestId("iso").textContent).toBe("2015-05-05");
  });

  it("füllt eine einstellige Eingabe beim Verlassen auf", () => {
    renderField();

    fireEvent.change(day(), { target: { value: "7" } });
    fireEvent.blur(day());
    expect(day()).toHaveValue("07");
  });

  it("verteilt ein ganzes eingefügtes Datum auf die drei Felder", () => {
    render(<Harness />);

    fireEvent.change(day(), { target: { value: "2013-04-10" } });

    expect(day()).toHaveValue("10");
    expect(month()).toHaveValue("04");
    expect(year()).toHaveValue("2013");
    expect(screen.getByTestId("iso").textContent).toBe("2013-04-10");
  });

  it("nimmt keine Buchstaben an", () => {
    renderField();

    fireEvent.change(day(), { target: { value: "1a" } });
    expect(day()).toHaveValue("1");
  });

  it("leert die Kästchen, wenn der Elternwert zurückgesetzt wird", () => {
    render(<Harness />);

    fireEvent.change(day(), { target: { value: "2013-04-10" } });
    expect(year()).toHaveValue("2013");

    fireEvent.click(screen.getByRole("button", { name: "zuruecksetzen" }));

    expect(day()).toHaveValue("");
    expect(month()).toHaveValue("");
    expect(year()).toHaveValue("");
  });
});
