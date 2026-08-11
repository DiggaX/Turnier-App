/**
 * Der Umschalter im Nachmelde-Formular eines Teamturniers.
 *
 * Er entscheidet, was beim Tresen ueberhaupt moeglich ist: solange es nur „Team
 * nachmelden" gab, wurde aus einem Kind ohne Handy ein 1-von-3-Geisterteam.
 * Geprueft wird deshalb nicht das Aussehen, sondern was am Ende bei der Action
 * ankommt — die Aufstellung darf im Einzelmodus nicht mitfahren, und die
 * Optionen duerfen den Team- und Solo-Weg nicht anfassen.
 *
 * Eigene Datei neben add-participant-form.test.tsx: die pinnt den Teamweg.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const addParticipant = vi.fn();
const refresh = vi.fn();

vi.mock("./actions", () => ({
  addParticipant: (...args: unknown[]) => addParticipant(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { AddParticipantForm } from "./add-participant-form";

const TEAMS = [
  { id: "team-1", name: "Team Rakete", memberCount: 2 },
  { id: "team-2", name: "Team Komet", memberCount: 1 },
  // Voll bei teamSize 3 — die Seite reicht auch volle Teams durch.
  { id: "team-3", name: "Team Voll", memberCount: 3 },
];

/** Formular aufklappen und in den Einzelmodus wechseln. */
function openSingle() {
  fireEvent.click(screen.getByRole("button", { name: /Team nachmelden/i }));
  fireEvent.click(screen.getByRole("button", { name: /Einzelspieler nachmelden/i }));
}

function fillPerson() {
  fireEvent.change(screen.getByLabelText("Anzeigename"), {
    target: { value: "Niki" },
  });
  fireEvent.change(screen.getByLabelText("Geburtsdatum"), {
    target: { value: "2014-05-02" },
  });
}

beforeEach(() => {
  addParticipant.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

describe("AddParticipantForm — Einzelspieler", () => {
  it("bietet den Einzelweg schon im eingeklappten Zustand an", () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} teams={TEAMS} />);
    // Der Live-Vorfall begann eine Ebene frueher als das Formular: an der
    // Turnierseite stand nur „Team nachmelden", und genau das tat der Tresen
    // dann auch mit einem einzelnen Kind.
    fireEvent.click(screen.getByRole("button", { name: /Einzelspieler nachmelden/i }));

    expect(screen.getByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.queryByLabelText("Teamname")).toBeNull();
  });

  it("tauscht die Aufstellung gegen die Felder einer Person", () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} />);
    openSingle();

    expect(screen.getByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.getByLabelText("Geburtsdatum")).toBeInTheDocument();
    expect(screen.queryByLabelText("Captain")).toBeNull();
    expect(screen.queryByLabelText("Teamname")).toBeNull();
    // Ohne uebergebene Teams waere die Auswahl eine Frage ohne Antwort.
    expect(screen.queryByLabelText("Direkt in Team (optional)")).toBeNull();
  });

  it("meldet ohne Team als Restspieler an", async () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} teams={TEAMS} />);
    openSingle();
    fillPerson();
    fireEvent.click(screen.getByRole("button", { name: /Anlegen & einchecken/i }));

    await waitFor(() => expect(addParticipant).toHaveBeenCalledTimes(1));
    expect(addParticipant).toHaveBeenCalledWith("t1", "Niki", "2014-05-02", "", [], {
      asSingle: true,
      teamId: null,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("reicht das gewaehlte Team durch", async () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} teams={TEAMS} />);
    openSingle();
    fillPerson();
    const select = screen.getByLabelText("Direkt in Team (optional)");
    // Belegung MIT Bezugsgroesse: im Einzelmodus ist die Aufstellung
    // ausgeblendet, „belegt 2" allein sagt am Tresen nichts.
    expect(screen.getByRole("option", { name: "Team Rakete (2/3)" })).toBeInTheDocument();
    // Ein volles Team steht gar nicht zur Wahl — sonst entstuende hier lautlos
    // ein Viertel im 3v3.
    expect(screen.queryByRole("option", { name: /Team Voll/ })).toBeNull();
    fireEvent.change(select, { target: { value: "team-2" } });
    fireEvent.click(screen.getByRole("button", { name: /Anlegen & einchecken/i }));

    await waitFor(() => expect(addParticipant).toHaveBeenCalledTimes(1));
    expect(addParticipant).toHaveBeenCalledWith("t1", "Niki", "2014-05-02", "", [], {
      asSingle: true,
      teamId: "team-2",
    });
  });

  it("laesst den Teamweg ohne Optionen laufen", async () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} teams={TEAMS} />);
    fireEvent.click(screen.getByRole("button", { name: /Team nachmelden/i }));

    fireEvent.change(screen.getByLabelText("Teamname"), {
      target: { value: "Team Rakete" },
    });
    fireEvent.change(screen.getByLabelText("Geburtsdatum Captain"), {
      target: { value: "2013-04-10" },
    });
    fireEvent.change(screen.getByLabelText("Captain"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: /Anlegen & einchecken/i }));

    await waitFor(() => expect(addParticipant).toHaveBeenCalledTimes(1));
    expect(addParticipant).toHaveBeenCalledWith("t1", "Team Rakete", "2013-04-10", "", [
      { name: "Ada", gamertag: "" },
      { name: "", gamertag: "" },
      { name: "", gamertag: "" },
    ]);
  });
});
