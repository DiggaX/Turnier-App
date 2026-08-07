/**
 * The pairing token IS a staff session for whoever redeems it, so the parts
 * that bound its blast radius — short life, unguessable, stored only as a hash
 * — are covered here rather than left to the route.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  hashPairingToken,
  newPairingToken,
  PAIRING_TTL_MS,
  sessionIdFromAccessToken,
} from "./device-pairing";

describe("newPairingToken", () => {
  it("is long enough not to be guessable inside the window", () => {
    expect(newPairingToken().length).toBeGreaterThanOrEqual(43);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 500 }, () => newPairingToken()));
    expect(seen.size).toBe(500);
  });

  it("stays url-safe so it survives being put in a QR path", () => {
    for (let i = 0; i < 50; i++) {
      expect(newPairingToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("hashPairingToken", () => {
  it("does not keep the token recoverable", () => {
    const token = newPairingToken();
    expect(hashPairingToken(token)).not.toContain(token);
    expect(hashPairingToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is stable, so a scan can be matched against the stored row", () => {
    const token = newPairingToken();
    expect(hashPairingToken(token)).toBe(hashPairingToken(token));
  });

  it("separates different tokens", () => {
    expect(hashPairingToken("a")).not.toBe(hashPairingToken("b"));
  });
});

describe("PAIRING_TTL_MS", () => {
  it("keeps the window short — a photographed code must go stale fast", () => {
    expect(PAIRING_TTL_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });
});

describe("sessionIdFromAccessToken", () => {
  /** Build a JWT-shaped string; only the payload segment is ever read. */
  function token(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `header.${body}.signature`;
  }

  it("reads the session id that labels and revokes a device", () => {
    expect(sessionIdFromAccessToken(token({ session_id: "sess-1" }))).toBe(
      "sess-1",
    );
  });

  it("returns null when the claim is absent", () => {
    expect(sessionIdFromAccessToken(token({ sub: "user-1" }))).toBeNull();
  });

  it("returns null rather than throwing on a malformed token", () => {
    expect(sessionIdFromAccessToken("nonsense")).toBeNull();
    expect(sessionIdFromAccessToken("a.!!!not-base64!!!.c")).toBeNull();
    expect(sessionIdFromAccessToken("")).toBeNull();
  });

  it("ignores a non-string claim", () => {
    expect(sessionIdFromAccessToken(token({ session_id: 42 }))).toBeNull();
  });
});
