import { describe, expect, it } from "vitest";
import { orgSlug } from "./slug";

describe("orgSlug", () => {
  it("lowercases, replaces non-alphanumerics with single hyphens, trims", () => {
    expect(orgSlug("Eventpilot")).toBe("eventpilot");
    expect(orgSlug("Acme  E-Sports!! GmbH")).toBe("acme-e-sports-gmbh");
    expect(orgSlug("  --Hallo--  ")).toBe("hallo");
  });
  it("maps umlauts and returns empty string for no alphanumerics", () => {
    expect(orgSlug("Münchner Löwen")).toBe("muenchner-loewen");
    expect(orgSlug("ÜBER uns")).toBe("ueber-uns");
    expect(orgSlug("!!!")).toBe("");
  });
});
