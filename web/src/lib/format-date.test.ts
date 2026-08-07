/**
 * These pin the output to German local time regardless of where the code runs.
 * Left to the runtime, the server (UTC on Vercel) and the browser disagree, and
 * in a client component React aborts hydration on the mismatch — which stops the
 * component attaching its event handlers, so its buttons silently do nothing.
 */
import { describe, it, expect } from "vitest";

import {
  formatBirthdate,
  formatDate,
  formatDateTime,
  formatShortDateTime,
} from "./format-date";

describe("formatDateTime", () => {
  it("renders summer time as CEST, not UTC", () => {
    // 11:00Z in August is 13:00 in Berlin — the two hours a tournament start
    // was off by in production.
    expect(formatDateTime("2026-08-10T11:00:00Z")).toBe("10.08.2026, 13:00");
  });

  it("renders winter time as CET", () => {
    expect(formatDateTime("2026-01-10T11:00:00Z")).toBe("10.01.2026, 12:00");
  });

  it("treats a zone-less Postgres timestamp as UTC", () => {
    expect(formatDateTime("2026-08-07 18:33:12.9")).toBe("07.08.2026, 20:33");
  });

  it("accepts a Date", () => {
    expect(formatDateTime(new Date("2026-08-10T11:00:00Z"))).toBe(
      "10.08.2026, 13:00",
    );
  });

  it("falls back instead of printing Invalid Date", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("kein datum")).toBe("—");
    expect(formatDateTime(null, "offen")).toBe("offen");
  });
});

describe("formatShortDateTime", () => {
  it("drops the year but keeps the zone correction", () => {
    expect(formatShortDateTime("2026-08-07T18:33:00Z")).toBe("07.08., 20:33");
  });
});

describe("formatDate", () => {
  it("rolls over the day when the zone shifts it", () => {
    // 22:30Z on the 7th is already the 8th in Berlin.
    expect(formatDate("2026-08-07T22:30:00Z")).toBe("08.08.2026");
  });
});

describe("formatBirthdate", () => {
  it("renders the calendar date as given", () => {
    expect(formatBirthdate("1995-05-15")).toBe("15.05.1995");
  });

  it("never shifts a day — a birthdate is not an instant", () => {
    // Parsing this as midnight UTC and formatting via a zone would print the 1st.
    expect(formatBirthdate("2000-01-01")).toBe("01.01.2000");
    expect(formatBirthdate("2000-12-31")).toBe("31.12.2000");
  });

  it("falls back on missing or malformed input", () => {
    expect(formatBirthdate(null)).toBe("—");
    expect(formatBirthdate("1995")).toBe("—");
  });
});
