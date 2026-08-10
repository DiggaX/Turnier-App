import { describe, it, expect } from "vitest";
import {
  ageOn,
  isMinor,
  requiredConsentMethod,
  validBirthdate,
} from "@/lib/consent";

const on = new Date("2026-06-16T00:00:00Z");

describe("validBirthdate", () => {
  it("accepts a real past date", () => {
    expect(validBirthdate("2013-04-10", on)).toBe(true);
    expect(validBirthdate("2026-06-16", on)).toBe(true); // today counts
  });
  it("rejects the future", () => {
    expect(validBirthdate("2026-07-10", on)).toBe(false);
  });
  it("rejects a date that does not exist", () => {
    // Date() would roll this over to March 3rd instead of failing.
    expect(validBirthdate("2013-02-31", on)).toBe(false);
  });
  it("rejects wrong shapes and empty input", () => {
    expect(validBirthdate("", on)).toBe(false);
    expect(validBirthdate("10.04.2013", on)).toBe(false);
    expect(validBirthdate("2013-4-10", on)).toBe(false);
    expect(validBirthdate("Freitag", on)).toBe(false);
  });
  it("rejects implausibly old years", () => {
    expect(validBirthdate("1899-12-31", on)).toBe(false);
  });
});

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
