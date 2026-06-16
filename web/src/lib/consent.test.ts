import { describe, it, expect } from "vitest";
import { ageOn, isMinor, requiredConsentMethod } from "@/lib/consent";

const on = new Date("2026-06-16T00:00:00Z");

describe("consent age logic", () => {
  it("computes full years", () => {
    expect(ageOn("2008-06-16", on)).toBe(18);
    expect(ageOn("2008-06-17", on)).toBe(17); // birthday not yet reached
  });
  it("flags minors", () => {
    expect(isMinor("2010-01-01", on)).toBe(true);
    expect(isMinor("2000-01-01", on)).toBe(false);
    expect(isMinor("2008-06-16", on)).toBe(false); // exactly 18
  });
  it("selects consent method", () => {
    expect(requiredConsentMethod("2000-01-01", on)).toBe("checkbox");
    expect(requiredConsentMethod("2012-01-01", on)).toBe("signature");
  });
});
