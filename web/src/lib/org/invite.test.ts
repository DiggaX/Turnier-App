import { describe, expect, it } from "vitest";
import { buildInviteUrl, isInviteUsable } from "./invite";

describe("isInviteUsable", () => {
  const now = new Date("2026-06-18T12:00:00Z");
  it("is true for a future, un-accepted invite", () => {
    expect(isInviteUsable({ expiresAt: "2026-06-25T12:00:00Z", acceptedAt: null }, now)).toBe(true);
  });
  it("is false when accepted or expired", () => {
    expect(isInviteUsable({ expiresAt: "2026-06-25T12:00:00Z", acceptedAt: "2026-06-19T00:00:00Z" }, now)).toBe(false);
    expect(isInviteUsable({ expiresAt: "2026-06-17T12:00:00Z", acceptedAt: null }, now)).toBe(false);
  });
});

describe("buildInviteUrl", () => {
  it("builds the signup URL with the code", () => {
    expect(buildInviteUrl("https://x.app", "abc")).toBe("https://x.app/signup?invite=abc");
  });
});
