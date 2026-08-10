/**
 * Der Wortlaut der Fotoerlaubnis — nach der Einverständniserklärung, die der
 * Veranstalter bisher auf Papier unterschreiben lässt.
 *
 * Eigene Datei und pure Funktion, damit der Text von einem Test gepinnt werden
 * kann: er wird bei jeder Erteilung als `consents.consent_text` mitgespeichert,
 * und was einmal zugestimmt wurde, darf sich nicht rückwirkend ändern.
 */

/**
 * Der Wortlaut, dem vor dem 2026-08-10 zugestimmt wurde — damals stand er als
 * Konstante im Anmeldeschritt und wurde nicht mitgespeichert. Für Zeilen ohne
 * `consent_text` ist das nachweislich der Satz, den die Person gesehen hat.
 */
export const LEGACY_CONSENT_TEXT =
  "Ich willige in Bild/Ton/Video-Aufnahmen und deren Nutzung für Social Media/Dritte ein";

/** Der Wortlaut für den Ausdruck: gespeicherter Satz, sonst der alte. */
export function storedConsentText(consentText: string | null): string {
  return consentText?.trim() ? consentText : LEGACY_CONSENT_TEXT;
}

export interface ConsentOrg {
  name: string;
  /** Postanschrift der verantwortlichen Stelle; fehlt, solange sie niemand gepflegt hat. */
  address: string | null;
}

/**
 * @param subjectName Name der abgebildeten Person — bei "guardian" das Kind,
 *   also der angemeldete Teilnehmer selbst.
 */
export function photoConsentText(
  org: ConsentOrg,
  grantor: "self" | "guardian",
  subjectName: string,
): string {
  const address = org.address?.trim();
  const responsible = address ? `${org.name} (${address})` : org.name;
  const subject =
    grantor === "guardian"
      ? `meine Tochter/mein Sohn ${subjectName.trim()} abgebildet ist`
      : "ich abgebildet bin";

  return (
    `Ich bin damit einverstanden, dass ${responsible} Bildmaterial, auf dem ` +
    `${subject}, für alle werblichen Maßnahmen (on- und offline) ohne weitere ` +
    `Rücksprache nutzen kann.`
  );
}
