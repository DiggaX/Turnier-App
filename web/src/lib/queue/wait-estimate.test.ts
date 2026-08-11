import { describe, expect, it } from "vitest";

import {
  countAhead,
  estimateWaitMinutes,
  findNextOwnMatch,
  isOpen,
  queueLabel,
  queueStatus,
  type Pacing,
  type QueueMatch,
} from "./wait-estimate";

const PACING: Pacing = { matchDurationMin: 10, parallelStations: 1 };

/** Kurzschreibweise fuer ein Match; alles Weggelassene ist der Normalfall. */
function m(part: Partial<QueueMatch> & { id: string }): QueueMatch {
  return {
    round: 1,
    slot: 1,
    status: "pending",
    participantAId: "x",
    participantBId: "y",
    ...part,
  };
}

describe("isOpen", () => {
  it("zaehlt pending und live", () => {
    expect(isOpen(m({ id: "a", status: "pending" }))).toBe(true);
    expect(isOpen(m({ id: "b", status: "live" }))).toBe(true);
  });

  it("zaehlt done und bye nicht", () => {
    expect(isOpen(m({ id: "a", status: "done" }))).toBe(false);
    expect(isOpen(m({ id: "b", status: "bye" }))).toBe(false);
  });

  it("zaehlt eine Partie ohne feststehenden Gegner nicht", () => {
    expect(isOpen(m({ id: "a", participantBId: null }))).toBe(false);
    expect(isOpen(m({ id: "b", participantAId: null }))).toBe(false);
  });
});

describe("findNextOwnMatch", () => {
  const mine = "me";

  it("nimmt die fruehste offene eigene Partie (Runde vor Slot)", () => {
    const matches = [
      m({ id: "spaet", round: 2, slot: 1, participantAId: mine }),
      m({ id: "frueh", round: 1, slot: 9, participantBId: mine }),
    ];
    expect(findNextOwnMatch(matches, mine)?.id).toBe("frueh");
  });

  it("sortiert innerhalb einer Runde nach Slot", () => {
    const matches = [
      m({ id: "slot5", round: 1, slot: 5, participantAId: mine }),
      m({ id: "slot2", round: 1, slot: 2, participantAId: mine }),
    ];
    expect(findNextOwnMatch(matches, mine)?.id).toBe("slot2");
  });

  it("uebergeht bereits gespielte eigene Partien", () => {
    const matches = [
      m({ id: "gespielt", round: 1, slot: 1, status: "done", participantAId: mine }),
      m({ id: "offen", round: 3, slot: 1, participantAId: mine }),
    ];
    expect(findNextOwnMatch(matches, mine)?.id).toBe("offen");
  });

  it("uebergeht fremde Partien, auch fruehere", () => {
    const matches = [
      m({ id: "fremd", round: 1, slot: 1 }),
      m({ id: "meins", round: 4, slot: 1, participantBId: mine }),
    ];
    expect(findNextOwnMatch(matches, mine)?.id).toBe("meins");
  });

  it("liefert null, wenn nichts Eigenes offen ist", () => {
    expect(findNextOwnMatch([m({ id: "fremd" })], mine)).toBeNull();
    expect(findNextOwnMatch([], mine)).toBeNull();
  });

  it("nimmt eine eigene Partie, deren Gegner noch nicht feststeht, NICHT", () => {
    const matches = [
      m({ id: "halb", round: 1, slot: 1, participantAId: mine, participantBId: null }),
    ];
    expect(findNextOwnMatch(matches, mine)).toBeNull();
  });
});

describe("countAhead", () => {
  const target = m({ id: "meins", round: 2, slot: 3, participantAId: "me" });

  it("zaehlt nur, was echt davor liegt", () => {
    const matches = [
      target,
      m({ id: "runde1", round: 1, slot: 99 }), // davor
      m({ id: "gleiche-runde-frueher", round: 2, slot: 1 }), // davor
      m({ id: "gleiche-runde-spaeter", round: 2, slot: 7 }), // danach
      m({ id: "runde3", round: 3, slot: 1 }), // danach
    ];
    expect(countAhead(matches, target)).toBe(2);
  });

  it("zaehlt laufende Partien mit — sie belegen eine Station", () => {
    const matches = [
      target,
      m({ id: "laeuft", round: 1, slot: 1, status: "live" }),
    ];
    expect(countAhead(matches, target)).toBe(1);
  });

  it("zaehlt gespielte und Freilose davor nicht", () => {
    const matches = [
      target,
      m({ id: "fertig", round: 1, slot: 1, status: "done" }),
      m({ id: "freilos", round: 1, slot: 2, status: "bye" }),
      m({ id: "ohne-gegner", round: 1, slot: 3, participantBId: null }),
    ];
    expect(countAhead(matches, target)).toBe(0);
  });

  it("zaehlt sich selbst nicht mit", () => {
    expect(countAhead([target], target)).toBe(0);
  });
});

describe("estimateWaitMinutes", () => {
  it("0 davor heisst 0 Minuten", () => {
    expect(estimateWaitMinutes(0, PACING)).toBe(0);
  });

  it("eine Station: jede Partie kostet die volle Dauer", () => {
    expect(estimateWaitMinutes(2, PACING)).toBe(20);
  });

  it("rundet auf volle Durchgaenge auf", () => {
    expect(estimateWaitMinutes(3, { matchDurationMin: 12, parallelStations: 2 })).toBe(24);
  });

  it("mehr Stationen als Partien davor heisst genau einen Durchgang", () => {
    expect(estimateWaitMinutes(2, { matchDurationMin: 12, parallelStations: 8 })).toBe(12);
  });

  it("faengt unsinnige Werte ab, statt NaN oder Unendlich zu liefern", () => {
    expect(estimateWaitMinutes(4, { matchDurationMin: 12, parallelStations: 0 })).toBe(48);
    expect(estimateWaitMinutes(4, { matchDurationMin: 12, parallelStations: -3 })).toBe(48);
    expect(estimateWaitMinutes(-2, PACING)).toBe(0);
    expect(estimateWaitMinutes(2, { matchDurationMin: 0, parallelStations: 1 })).toBe(0);
  });
});

describe("queueStatus", () => {
  const mine = "me";

  it("ohne offene eigene Partie: none", () => {
    expect(queueStatus([m({ id: "fremd" })], mine, PACING)).toEqual({ kind: "none" });
  });

  it("eigene Partie laeuft: live statt Schaetzung", () => {
    const matches = [
      m({ id: "meins", round: 1, slot: 2, status: "live", participantAId: mine }),
      m({ id: "davor", round: 1, slot: 1 }),
    ];
    expect(queueStatus(matches, mine, PACING)).toEqual({
      kind: "live",
      matchId: "meins",
    });
  });

  it("nichts davor: next", () => {
    const matches = [
      m({ id: "meins", round: 1, slot: 1, participantAId: mine }),
      m({ id: "danach", round: 1, slot: 2 }),
    ];
    expect(queueStatus(matches, mine, PACING)).toEqual({
      kind: "next",
      matchId: "meins",
    });
  });

  it("zwei davor bei einer Station: 20 Minuten", () => {
    const matches = [
      m({ id: "meins", round: 1, slot: 3, participantAId: mine }),
      m({ id: "a", round: 1, slot: 1 }),
      m({ id: "b", round: 1, slot: 2 }),
    ];
    expect(queueStatus(matches, mine, PACING)).toEqual({
      kind: "waiting",
      matchId: "meins",
      ahead: 2,
      minutes: 20,
    });
  });
});

describe("queueLabel", () => {
  it("sagt bei laufender Partie nichts von Minuten", () => {
    expect(queueLabel({ kind: "live", matchId: "x" })).toBe(
      "Deine Partie läuft gerade.",
    );
  });

  it("sagt deutlich, wenn man dran ist", () => {
    expect(queueLabel({ kind: "next", matchId: "x" })).toBe(
      "Du bist als Nächstes dran!",
    );
  });

  it("nutzt den Singular bei genau einem Spiel davor", () => {
    expect(
      queueLabel({ kind: "waiting", matchId: "x", ahead: 1, minutes: 10 }),
    ).toBe("Noch 1 Spiel vor dir — ungefähr 10 Minuten");
  });

  it("nutzt den Plural ab zwei", () => {
    expect(
      queueLabel({ kind: "waiting", matchId: "x", ahead: 2, minutes: 20 }),
    ).toBe("Noch 2 Spiele vor dir — ungefähr 20 Minuten");
  });

  it("laesst die Minuten weg, wenn keine Dauer hinterlegt ist", () => {
    expect(
      queueLabel({ kind: "waiting", matchId: "x", ahead: 3, minutes: 0 }),
    ).toBe("Noch 3 Spiele vor dir");
  });

  it("hat auch fuer none einen Satz", () => {
    expect(queueLabel({ kind: "none" })).toBe(
      "Für dich steht gerade keine Partie an.",
    );
  });
});
