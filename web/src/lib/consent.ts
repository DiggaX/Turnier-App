/**
 * YYYY-MM-DD that is a real calendar date, not in the future, and after 1900.
 *
 * The public registration form leans on the browser's date input; the
 * organizer's Nachmeldung goes through a server action, where the string
 * arrives unchecked and `birthdate` is NOT NULL in the database.
 */
export function validBirthdate(value: string, today: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return false;
  // Round-trip guard: new Date("2026-02-31") silently becomes March 3rd.
  if (date.toISOString().slice(0, 10) !== value) return false;
  if (date.getTime() > today.getTime()) return false;
  return date.getUTCFullYear() >= 1900;
}

export function ageOn(birthdate: string, on: Date): number {
  const b = new Date(birthdate + "T00:00:00Z");
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const m = on.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function isMinor(birthdate: string, on: Date): boolean {
  return ageOn(birthdate, on) < 18;
}

export function requiredConsentMethod(
  birthdate: string,
  on: Date,
): "checkbox" | "signature" {
  return isMinor(birthdate, on) ? "signature" : "checkbox";
}
