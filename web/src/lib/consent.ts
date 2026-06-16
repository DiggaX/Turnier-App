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
