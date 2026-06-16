import { describe, it, expect } from "vitest";
import { formatLabel, statusLabel, modeLabel } from "@/lib/labels";

describe("tournament label mappings", () => {
  it("maps formats to German labels", () => {
    expect(formatLabel("single_elim")).toBe("Single Elimination");
    expect(formatLabel("double_elim")).toBe("Double Elimination");
    expect(formatLabel("round_robin")).toBe("Round Robin");
    expect(formatLabel("swiss")).toBe("Swiss");
    expect(formatLabel("groups_playoffs")).toBe("Gruppen → Playoffs");
  });

  it("maps statuses to German labels", () => {
    expect(statusLabel("draft")).toBe("Bald");
    expect(statusLabel("registration")).toBe("Anmeldung offen");
    expect(statusLabel("running")).toBe("Läuft");
    expect(statusLabel("finished")).toBe("Beendet");
  });

  it("maps modes to German labels", () => {
    expect(modeLabel("lan")).toBe("LAN");
    expect(modeLabel("online")).toBe("Online");
    expect(modeLabel("hybrid")).toBe("Hybrid");
  });
});
