/**
 * Die Anschrift bleibt nach außen eine Zeile (`consents.address`), innen sind es
 * drei Felder. Geprüft wird beides, und vor allem die Fälle, in denen die Hilfe
 * schaden könnte:
 *
 * - Ein bereits getippter Ort darf **nicht** überschrieben werden.
 * - Gehören zu einer PLZ mehrere Orte, wird nichts geraten.
 * - Ist der Dienst nicht erreichbar, muss das Formular trotzdem ausfüllbar
 *   bleiben — eine Anmeldung darf nicht an einem fremden Server hängen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import {
  AddressField,
  partsToAddress,
  partsFromAddress,
} from "./address-field";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <AddressField id="addr" value={value} onChange={setValue} />
      <output data-testid="line">{value}</output>
    </>
  );
}

const street = () => screen.getByPlaceholderText("Straße und Hausnummer");
const plz = () => screen.getByPlaceholderText("PLZ");
const ort = () => screen.getByPlaceholderText("Ort");
const line = () => screen.getByTestId("line").textContent;

/** Antwort der eigenen /api/plz-Route nachstellen. */
function mockPlz(places: string[] | Error) {
  const fetchMock = vi.fn(async () => {
    if (places instanceof Error) throw places;
    return { ok: true, json: async () => ({ places }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("partsToAddress", () => {
  it("setzt die Zeile zusammen, wie sie im Ausdruck steht", () => {
    expect(
      partsToAddress({ street: "Hauptstraße 1", plz: "23769", ort: "Fehmarn" }),
    ).toBe("Hauptstraße 1, 23769 Fehmarn");
  });

  it("lässt Trennzeichen weg, solange Teile fehlen", () => {
    expect(partsToAddress({ street: "Hauptstraße 1", plz: "", ort: "" })).toBe(
      "Hauptstraße 1",
    );
    expect(partsToAddress({ street: "", plz: "23769", ort: "Fehmarn" })).toBe(
      "23769 Fehmarn",
    );
    expect(partsToAddress({ street: "", plz: "", ort: "" })).toBe("");
  });
});

describe("partsFromAddress", () => {
  it("zerlegt eine zusammengesetzte Zeile wieder", () => {
    expect(partsFromAddress("Hauptstraße 1, 23769 Fehmarn")).toEqual({
      street: "Hauptstraße 1",
      plz: "23769",
      ort: "Fehmarn",
    });
  });

  it("packt alles in die Straße, was nicht dem Muster folgt", () => {
    expect(partsFromAddress("Bei der Kirche, Fehmarn")).toEqual({
      street: "Bei der Kirche, Fehmarn",
      plz: "",
      ort: "",
    });
  });
});

describe("AddressField", () => {
  it("füllt den Ort, sobald die PLZ fünf Ziffern hat", async () => {
    const fetchMock = mockPlz(["Fehmarn"]);
    render(<Harness />);

    fireEvent.change(street(), { target: { value: "Hauptstraße 1" } });
    fireEvent.change(plz(), { target: { value: "23769" } });

    await waitFor(() => expect(ort()).toHaveValue("Fehmarn"));
    expect(line()).toBe("Hauptstraße 1, 23769 Fehmarn");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plz?code=23769",
      expect.anything(),
    );
  });

  it("fragt erst bei der fünften Ziffer, nicht bei jeder", async () => {
    const fetchMock = mockPlz(["Fehmarn"]);
    render(<Harness />);

    for (const partial of ["2", "23", "237", "2376"]) {
      fireEvent.change(plz(), { target: { value: partial } });
    }
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(plz(), { target: { value: "23769" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("überschreibt einen selbst getippten Ort nicht", async () => {
    mockPlz(["Fehmarn"]);
    render(<Harness />);

    fireEvent.change(ort(), { target: { value: "Burg auf Fehmarn" } });
    fireEvent.change(plz(), { target: { value: "23769" } });

    await waitFor(() => expect(plz()).toHaveValue("23769"));
    expect(ort()).toHaveValue("Burg auf Fehmarn");
  });

  it("rät nicht, wenn mehrere Orte zur PLZ gehören", async () => {
    mockPlz(["Neukirchen", "Grömitz"]);
    render(<Harness />);

    fireEvent.change(plz(), { target: { value: "23779" } });

    await waitFor(() => expect(plz()).toHaveValue("23779"));
    expect(ort()).toHaveValue("");
    // Stattdessen zur Auswahl gestellt, statt eine der beiden zu erfinden.
    expect(ort()).toHaveAttribute("list");
  });

  it("bleibt ausfüllbar, wenn der Dienst nicht erreichbar ist", async () => {
    mockPlz(new Error("offline"));
    render(<Harness />);

    fireEvent.change(street(), { target: { value: "Hauptstraße 1" } });
    fireEvent.change(plz(), { target: { value: "23769" } });
    await waitFor(() => expect(plz()).toHaveValue("23769"));

    fireEvent.change(ort(), { target: { value: "Fehmarn" } });
    expect(line()).toBe("Hauptstraße 1, 23769 Fehmarn");
  });

  it("nimmt in der PLZ keine Buchstaben an", () => {
    mockPlz([]);
    render(<Harness />);

    fireEvent.change(plz(), { target: { value: "23a" } });
    expect(plz()).toHaveValue("23");
  });
});
