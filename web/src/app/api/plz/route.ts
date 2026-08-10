import { type NextRequest, NextResponse } from "next/server";

/**
 * Postleitzahl → Ort, für das Anschriftsfeld der Fotoerlaubnis.
 *
 * Warum über eine eigene Route und nicht direkt aus dem Browser: so spricht das
 * Gerät der Eltern nie mit einem fremden Dienst, und was hinausgeht, steht an
 * genau einer Stelle im Code. Hinaus geht **nur die Postleitzahl** — kein Name,
 * keine Straße, keine Hausnummer. Die eigentliche Anschrift verlässt den Browser
 * erst beim Absenden, und zwar in die eigene Datenbank.
 *
 * Fällt der Dienst aus, ist das Ergebnis eine leere Liste und kein Fehler: der
 * Ort wird dann eben getippt. Eine Anmeldung darf nicht daran scheitern, dass
 * ein fremder Server gerade nicht mag.
 */

/** Postleitzahlen ändern sich praktisch nie — einmal am Tag reicht reichlich. */
const REVALIDATE_SECONDS = 60 * 60 * 24;

const UPSTREAM = "https://openplzapi.org/de/Localities";

type Locality = { name?: string };

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";

  // Grenze zum fremden Dienst: nur fünf Ziffern gehen weiter, nichts sonst.
  if (!/^\d{5}$/.test(code)) {
    return NextResponse.json({ places: [] }, { status: 400 });
  }

  try {
    const res = await fetch(`${UPSTREAM}?postalCode=${code}`, {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return NextResponse.json({ places: [] });

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return NextResponse.json({ places: [] });

    // Mehrere Einträge pro PLZ kommen vor (ein Ort, mehrere Gemeindeteile).
    // Doppelte Namen fliegen raus, der Rest wird zur Auswahlliste im Feld.
    const places = [
      ...new Set(
        data
          .map((d) => (d as Locality).name)
          .filter((n): n is string => typeof n === "string" && n.length > 0),
      ),
    ];

    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ places: [] });
  }
}
