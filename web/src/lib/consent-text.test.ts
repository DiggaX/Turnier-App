import { describe, it, expect } from "vitest";
import { photoConsentText } from "@/lib/consent-text";

const org = {
  name: "Tourismus-Service Fehmarn",
  address: "Zur Strandpromenade 4, 23769 Fehmarn",
};

describe("photoConsentText", () => {
  it("names the responsible body with its address", () => {
    expect(photoConsentText(org, "self", "Rene")).toBe(
      "Ich bin damit einverstanden, dass Tourismus-Service Fehmarn " +
        "(Zur Strandpromenade 4, 23769 Fehmarn) Bildmaterial, auf dem ich " +
        "abgebildet bin, für alle werblichen Maßnahmen (on- und offline) ohne " +
        "weitere Rücksprache nutzen kann.",
    );
  });

  it("names the depicted child when a guardian grants", () => {
    expect(photoConsentText(org, "guardian", "Mia")).toContain(
      "auf dem meine Tochter/mein Sohn Mia abgebildet ist,",
    );
  });

  // Ohne gepflegte Anschrift bleibt der Satz ein Satz — keine leere Klammer.
  // (Die Klammer um "on- und offline" gehört zum Zweck und bleibt.)
  it("drops the bracket when no address is stored", () => {
    for (const address of [null, "  "]) {
      expect(
        photoConsentText({ name: "Fehmarn Esports", address }, "self", "Rene"),
      ).toContain("dass Fehmarn Esports Bildmaterial");
    }
    expect(
      photoConsentText({ name: "Fehmarn Esports", address: null }, "self", "Rene"),
    ).not.toContain("()");
  });
});
