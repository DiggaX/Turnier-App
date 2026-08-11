/**
 * Die Tresen-Zuordnung aus der Teilnehmerliste.
 *
 * Festgehalten wird vor allem die Nutzlast: saveAssignments erwartet genau die
 * eine geaenderte Zeile. Schickt man mehr, verliert jedes mitgeschickte Team
 * seinen Captain; schickt man die falsche Form, faellt es erst am Tresen auf.
 * Und der Leerwert bedeutet zweierlei — Platzhalter bei einem Kind ohne Team,
 * „raus aus dem Team" bei einem mit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveAssignments = vi.fn();
const refresh = vi.fn();

vi.mock("../teams/actions", () => ({
  saveAssignments: (...args: unknown[]) => saveAssignments(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { AssignTeamSelect } from "./assign-team-select";

const teams = [
  { id: "team-a", name: "Team Rakete", memberCount: 1 },
  { id: "team-b", name: "Team Blitz", memberCount: 2 },
];

function renderSelect(currentTeamId: string | null = null, list = teams) {
  render(
    <AssignTeamSelect
      tournamentId="t1"
      playerId="p1"
      playerName="Mia"
      currentTeamId={currentTeamId}
      teams={list}
      teamSize={3}
    />,
  );
  return screen.getByLabelText("Mia einem Team zuordnen");
}

beforeEach(() => {
  saveAssignments.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

describe("AssignTeamSelect", () => {
  it("zeigt alle Teams mit ihrem Stand und den Platzhalter", () => {
    renderSelect();

    expect(screen.getByRole("option", { name: "Team wählen…" })).toBeInTheDocument();
    // Mit Besetzung: ohne sie waehlt der Tresen blind und stopft das Kind in
    // ein Team, das schon voll ist.
    expect(
      screen.getByRole("option", { name: "Team Rakete (1/3)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Team Blitz (2/3)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "— kein Team —" })).toBeNull();
  });

  it("schickt genau die eine geaenderte Zeile und laedt neu", async () => {
    const select = renderSelect();

    fireEvent.change(select, { target: { value: "team-b" } });

    await waitFor(() => expect(saveAssignments).toHaveBeenCalledTimes(1));
    expect(saveAssignments).toHaveBeenCalledWith("t1", [
      { playerId: "p1", teamId: "team-b" },
    ]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("bietet dem Kind MIT Team das Herausnehmen an und schickt null", async () => {
    const select = renderSelect("team-a");

    expect(screen.getByRole("option", { name: "— kein Team —" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "" } });

    await waitFor(() => expect(saveAssignments).toHaveBeenCalledTimes(1));
    expect(saveAssignments).toHaveBeenCalledWith("t1", [
      { playerId: "p1", teamId: null },
    ]);
  });

  it("zeigt den Fehler der Aktion und laedt nicht neu", async () => {
    saveAssignments.mockResolvedValue({ error: "Unbekanntes Team in der Zuordnung." });
    const select = renderSelect();

    fireEvent.change(select, { target: { value: "team-a" } });

    expect(
      await screen.findByText("Unbekanntes Team in der Zuordnung."),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("zeigt gar nichts, solange es keine Mannschaft gibt", () => {
    render(
      <AssignTeamSelect
        tournamentId="t1"
        playerId="p1"
        playerName="Mia"
        currentTeamId={null}
        teams={[]}
        teamSize={3}
      />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
