"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Drei Zahlenfelder statt <input type="date">.
 *
 * Der native Datumstyp öffnet auf dem Handy einen Kalender, und ein Geburtsdatum
 * liegt dort immer viele Jahre zurück — am Anmeldetresen kostet das jedes Mal
 * mehrere Wischer. Getippt wird es in Sekunden, deshalb Tag/Monat/Jahr getrennt
 * mit Zifferntastatur (`inputMode="numeric"`) und automatischem Weiterspringen.
 *
 * Nach außen bleibt alles wie vorher: der Wert ist ein `YYYY-MM-DD`-String, so
 * wie ihn die Spalte `participants.birthdate` und `validBirthdate()` erwarten.
 * Solange etwas fehlt, ist er leer — dann greift dieselbe „erforderlich"-Meldung
 * wie zuvor, statt einer halben Angabe, die nach Tippfehler aussieht.
 */

export type DateParts = { day: string; month: string; year: string };

const EMPTY: DateParts = { day: "", month: "", year: "" };

const FULL_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const FULL_DE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/;

/** Die drei Kästchen → der ISO-String. Unvollständig ergibt "". */
export function partsToIso({ day, month, year }: DateParts): string {
  if (year.length !== 4 || day === "" || month === "") return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Ein vollständiges Datum auf die drei Kästchen verteilen — beide Schreibweisen,
 * die real vorkommen. Das deckt das Einfügen aus der Zwischenablage ab und den
 * Fall, dass der Elternwert schon ein fertiges Datum ist.
 */
export function partsFromText(raw: string): DateParts | null {
  const s = raw.trim();
  const iso = FULL_ISO.exec(s);
  if (iso) {
    return {
      year: iso[1],
      month: iso[2].padStart(2, "0"),
      day: iso[3].padStart(2, "0"),
    };
  }
  const de = FULL_DE.exec(s);
  if (de) {
    return {
      day: de[1].padStart(2, "0"),
      month: de[2].padStart(2, "0"),
      year: de[3],
    };
  }
  return null;
}

interface BirthdateFieldProps {
  /**
   * Liegt auf dem Tag-Feld, damit das vorhandene `<Label htmlFor>` weiter greift
   * — Klick aufs Label setzt den Fokus dorthin, und das Feld trägt dessen Namen.
   */
  id: string;
  /** `YYYY-MM-DD` oder "". */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function BirthdateField({
  id,
  value,
  onChange,
  required,
}: BirthdateFieldProps) {
  const [parts, setParts] = useState<DateParts>(
    () => partsFromText(value) ?? EMPTY,
  );
  const [seenValue, setSeenValue] = useState(value);

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Der Elternwert hat sich von außen geändert — das Orga-Formular leert sich
  // nach jedem angelegten Walk-in, sonst stünde beim nächsten noch das alte
  // Datum in den Kästchen. Angleich im Render statt in einem Effect: setState in
  // einem Effect ist in diesem Projekt ein Lint-Fehler und kostet einen zweiten
  // Renderdurchlauf.
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== partsToIso(parts)) setParts(partsFromText(value) ?? EMPTY);
  }

  function commit(next: DateParts) {
    setParts(next);
    const iso = partsToIso(next);
    setSeenValue(iso);
    onChange(iso);
  }

  function handleInput(
    field: keyof DateParts,
    raw: string,
    max: number,
    next?: React.RefObject<HTMLInputElement | null>,
  ) {
    // Ein ganzes Datum im Tag-Feld wird verteilt statt auf zwei Zeichen
    // abgeschnitten. Beim Tippen kann das nicht auslösen: dort kommt eine Ziffer
    // pro Ereignis an, und nach zweien springt der Fokus ohnehin weiter.
    if (field === "day") {
      const whole = partsFromText(raw);
      if (whole) {
        commit(whole);
        yearRef.current?.focus();
        return;
      }
    }

    const digits = raw.replace(/\D/g, "").slice(0, max);
    commit({ ...parts, [field]: digits });
    if (digits.length === max) next?.current?.focus();
  }

  /**
   * Einstellige Eingabe auffüllen: „7" ist der 07., nicht der 70.
   *
   * Der Wert kommt aus dem Feld selbst, nicht aus `parts`. Die zweite Ziffer
   * lässt den Fokus weiterspringen, und das blur feuert noch im selben Ereignis
   * — `parts` steht dann erst bei der ersten Ziffer. Aus „05" wurde so „00".
   */
  function padOnBlur(field: "day" | "month", raw: string) {
    if (raw.length === 1) commit({ ...parts, [field]: raw.padStart(2, "0") });
  }

  /** Rücktaste im leeren Feld springt zurück, statt ins Leere zu laufen. */
  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    field: keyof DateParts,
    prev?: React.RefObject<HTMLInputElement | null>,
  ) {
    if (e.key === "Backspace" && parts[field] === "" && prev?.current) {
      prev.current.focus();
    }
  }

  const box = "text-center tabular-nums";

  // Bewusst KEIN role="group" mit aria-labelledby auf das sichtbare Label, und
  // bewusst kein aria-label auf dem Tag-Feld. Beides würde denselben Namen ein
  // zweites Mal vergeben: das Label zeigt per htmlFor bereits auf das Tag-Feld.
  // Zwei Elemente mit dem Namen „Geburtsdatum" sind genau der Fehler, der in
  // consent-step.tsx behoben wurde — und Abfragen nach dem Label finden dann
  // zwei Treffer statt einem. Das Tag-Feld trägt also den Namen des Labels, die
  // beiden folgenden benennen sich selbst.
  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        ref={dayRef}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="bday-day"
        placeholder="TT"
        maxLength={2}
        required={required}
        value={parts.day}
        onChange={(e) => handleInput("day", e.target.value, 2, monthRef)}
        onBlur={(e) => padOnBlur("day", e.target.value)}
        className={`${box} w-14`}
      />
      <span aria-hidden className="text-fg-dim">
        .
      </span>
      <Input
        id={`${id}-month`}
        ref={monthRef}
        aria-label="Monat"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="bday-month"
        placeholder="MM"
        maxLength={2}
        required={required}
        value={parts.month}
        onChange={(e) => handleInput("month", e.target.value, 2, yearRef)}
        onBlur={(e) => padOnBlur("month", e.target.value)}
        onKeyDown={(e) => handleKeyDown(e, "month", dayRef)}
        className={`${box} w-14`}
      />
      <span aria-hidden className="text-fg-dim">
        .
      </span>
      <Input
        id={`${id}-year`}
        ref={yearRef}
        aria-label="Jahr"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="bday-year"
        placeholder="JJJJ"
        maxLength={4}
        required={required}
        value={parts.year}
        onChange={(e) => handleInput("year", e.target.value, 4)}
        onKeyDown={(e) => handleKeyDown(e, "year", monthRef)}
        className={`${box} w-20`}
      />
    </div>
  );
}
