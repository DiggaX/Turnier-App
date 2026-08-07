/**
 * Date and time rendering, pinned to German local time.
 *
 * Two reasons the time zone must be explicit rather than left to the runtime:
 *
 * 1. On the server it is whatever the host is set to — UTC on Vercel — so a
 *    tournament starting at 13:00 rendered as 11:00 for everybody.
 * 2. In a client component the server renders in the host zone and the browser
 *    re-renders in the visitor's, and React aborts hydration on the mismatch
 *    (error #418). The component then never attaches its event handlers, so its
 *    buttons quietly stop working — which is exactly what happened to the
 *    device list in production while working fine in dev, where both sides
 *    happened to share a zone.
 */

const ZONE = "Europe/Berlin";

/** Parse a timestamp, tolerating Postgres' zone-less `timestamp` output. */
function parse(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // `2026-08-07 18:33:12.9` from a zone-less column is UTC; mark it as such.
  const iso =
    value.includes("T") || value.endsWith("Z")
      ? value
      : `${value.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "07.08.2026, 20:33" */
export function formatDateTime(value: string | Date | null, fallback = "—"): string {
  const d = value === null ? null : parse(value);
  if (!d) return fallback;
  return d.toLocaleString("de-DE", {
    timeZone: ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** e.g. "07.08., 20:33" — for lists where the year is noise. */
export function formatShortDateTime(value: string | Date | null, fallback = "—"): string {
  const d = value === null ? null : parse(value);
  if (!d) return fallback;
  return d.toLocaleString("de-DE", {
    timeZone: ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** e.g. "07.08.2026" */
export function formatDate(value: string | Date | null, fallback = "—"): string {
  const d = value === null ? null : parse(value);
  if (!d) return fallback;
  return d.toLocaleDateString("de-DE", {
    timeZone: ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * A birthdate is a calendar date, not an instant. Formatting it through a time
 * zone can shift it a day, so render the parts as given.
 */
export function formatBirthdate(value: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return fallback;
  return `${d.slice(0, 2)}.${m}.${y}`;
}
