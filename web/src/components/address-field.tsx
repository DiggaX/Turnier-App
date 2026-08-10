"use client";

import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Anschrift in drei Feldern statt einer Zeile — für die Fotoerlaubnis, die
 * Eltern am Handy ausfüllen.
 *
 * Zwei Gründe, und der erste ist der wichtigere:
 *
 * 1. **Autofill greift erst dadurch.** Ein einzelnes Feld mit
 *    `autocomplete="street-address"` bietet das Handy nur selten an. Getrennte
 *    Felder mit `address-line1` / `postal-code` / `address-level2` sind das,
 *    wonach Browser und Passwortverwaltungen suchen — wer seine Adresse
 *    gespeichert hat, tippt gar nichts mehr. Kostet nichts und geht nirgendwo hin.
 * 2. **Nach fünf Ziffern füllt sich der Ort.** Über die eigene Route
 *    `/api/plz`, damit das Gerät der Eltern nicht mit einem fremden Dienst
 *    spricht; hinaus geht dabei nur die Postleitzahl.
 *
 * Nach außen bleibt es **ein** String, wie ihn `consents.address` seit jeher
 * speichert und der Ausdruck hinter „wohnhaft" setzt — keine Migration, alte
 * Zeilen unberührt.
 */

export type AddressParts = { street: string; plz: string; ort: string };

const EMPTY: AddressParts = { street: "", plz: "", ort: "" };

/** „Straße 1, 12345 Ort" — die Form, die vorher von Hand getippt wurde. */
const FULL = /^\s*(.*?),\s*(\d{5})\s+(.+?)\s*$/;
const PLZ_ORT_ONLY = /^\s*(\d{5})\s+(.+?)\s*$/;

/** Die drei Felder → eine Zeile. Leere Teile fallen samt Trennzeichen weg. */
export function partsToAddress({ street, plz, ort }: AddressParts): string {
  const place = [plz.trim(), ort.trim()].filter(Boolean).join(" ");
  return [street.trim(), place].filter(Boolean).join(", ");
}

/** Eine Zeile → die drei Felder. Was nicht passt, bleibt ganz in der Straße. */
export function partsFromAddress(raw: string): AddressParts {
  const full = FULL.exec(raw);
  if (full) return { street: full[1].trim(), plz: full[2], ort: full[3] };

  const short = PLZ_ORT_ONLY.exec(raw);
  if (short) return { street: "", plz: short[1], ort: short[2] };

  return { ...EMPTY, street: raw.trim() };
}

interface AddressFieldProps {
  /** Liegt auf dem Straßenfeld, damit das vorhandene `<Label htmlFor>` greift. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AddressField({
  id,
  value,
  onChange,
  disabled,
}: AddressFieldProps) {
  const [parts, setParts] = useState<AddressParts>(() =>
    partsFromAddress(value),
  );
  const [seenValue, setSeenValue] = useState(value);
  /** Mehrere Orte zu einer PLZ — dann entscheidet die Person, nicht wir. */
  const [places, setPlaces] = useState<string[]>([]);
  const inFlight = useRef<AbortController | null>(null);
  const listId = useId();

  // Wert von außen geändert (Formular zurückgesetzt). Angleich im Render statt
  // im Effect — genauso begründet wie im Geburtsdatum-Feld.
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== partsToAddress(parts)) setParts(partsFromAddress(value));
  }

  function commit(next: AddressParts) {
    setParts(next);
    const line = partsToAddress(next);
    setSeenValue(line);
    onChange(line);
  }

  /**
   * Nachschlagen erst bei genau fünf Ziffern, und nur aus dem Tipp-Ereignis
   * heraus — kein Effect, keine Schleife. Jede Antwort, die nicht mehr zur
   * aktuellen Eingabe gehört, wird abgebrochen.
   */
  async function lookup(plz: string, current: AddressParts) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    try {
      const res = await fetch(`/api/plz?code=${plz}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const { places: found } = (await res.json()) as { places?: string[] };
      if (controller.signal.aborted || !found?.length) return;

      setPlaces(found);
      // Nur füllen, wenn niemand schon etwas eingetragen hat: eine getippte
      // Angabe zu überschreiben wäre schlimmer als gar keine Hilfe.
      if (found.length === 1 && current.ort.trim() === "") {
        commit({ ...current, ort: found[0] });
      }
    } catch {
      // Abbruch oder Dienst nicht erreichbar: der Ort wird eben getippt.
    }
  }

  function handlePlz(raw: string) {
    const plz = raw.replace(/\D/g, "").slice(0, 5);
    const next = { ...parts, plz };
    commit(next);
    setPlaces([]);
    if (plz.length === 5) void lookup(plz, next);
  }

  // Wie im Geburtsdatum-Feld: kein role="group" und kein aria-label auf dem
  // Straßenfeld — das sichtbare Label zeigt per htmlFor schon dorthin, beides
  // zusammen vergäbe denselben Namen zweimal.
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        id={id}
        value={parts.street}
        disabled={disabled}
        autoComplete="address-line1"
        placeholder="Straße und Hausnummer"
        onChange={(e) => commit({ ...parts, street: e.target.value })}
      />
      <div className="flex gap-1.5">
        <Input
          id={`${id}-plz`}
          value={parts.plz}
          disabled={disabled}
          aria-label="Postleitzahl"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          autoComplete="postal-code"
          placeholder="PLZ"
          onChange={(e) => handlePlz(e.target.value)}
          className="w-24 tabular-nums"
        />
        <Input
          id={`${id}-ort`}
          value={parts.ort}
          disabled={disabled}
          aria-label="Ort"
          autoComplete="address-level2"
          placeholder="Ort"
          list={places.length > 1 ? listId : undefined}
          onChange={(e) => commit({ ...parts, ort: e.target.value })}
          className="flex-1"
        />
        {places.length > 1 && (
          <datalist id={listId}>
            {places.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
}
