/**
 * The Nachmeldung form on a team tournament.
 *
 * A 3v3 walk-in used to go in as a team with nobody in it, because the form
 * only ever asked for a name. These cover that the roster appears exactly when
 * team_size calls for it, and that what is typed reaches the action in the
 * order it was typed — the first row being the captain is not cosmetic, it is
 * what is_captain keys on.
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

/** Open the collapsed form and return nothing; fields are queried by label. */
function openForm(label: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  addParticipant.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

describe("AddParticipantForm", () => {
  it("asks for no roster on a solo tournament", () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={1} />);
    openForm(/Teilnehmer nachmelden/i);

    expect(screen.getByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.queryByText("Aufstellung")).toBeNull();
    expect(screen.queryByLabelText("Captain")).toBeNull();
  });

  it("asks for one row per team_size, first row the captain", () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} />);
    openForm(/Team nachmelden/i);

    expect(screen.getByLabelText("Teamname")).toBeInTheDocument();
    expect(screen.getByLabelText("Geburtsdatum Captain")).toBeInTheDocument();
    expect(screen.getByLabelText("Captain")).toBeInTheDocument();
    expect(screen.getByLabelText("Spieler 2 (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Spieler 3 (optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Spieler 4 (optional)")).toBeNull();
  });

  it("hands the roster to the action in the order it was typed", async () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} />);
    openForm(/Team nachmelden/i);

    fireEvent.change(screen.getByLabelText("Teamname"), {
      target: { value: "Team Rakete" },
    });
    fireEvent.change(screen.getByLabelText("Geburtsdatum Captain"), {
      target: { value: "2013-04-10" },
    });
    fireEvent.change(screen.getByLabelText("Captain"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText("Gamertag Captain (optional)"), {
      target: { value: "ada99" },
    });
    fireEvent.change(screen.getByLabelText("Spieler 2 (optional)"), {
      target: { value: "Bo" },
    });
    // Spieler 3 stays empty on purpose: a short-handed team must still go in.

    fireEvent.click(screen.getByRole("button", { name: /Anlegen & einchecken/i }));

    await waitFor(() => expect(addParticipant).toHaveBeenCalledTimes(1));
    expect(addParticipant).toHaveBeenCalledWith(
      "t1",
      "Team Rakete",
      "2013-04-10",
      "",
      [
        { name: "Ada", gamertag: "ada99" },
        { name: "Bo", gamertag: "" },
        { name: "", gamertag: "" },
      ],
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("sends no roster from a solo tournament", async () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={1} />);
    openForm(/Teilnehmer nachmelden/i);

    fireEvent.change(screen.getByLabelText("Anzeigename"), {
      target: { value: "Luuk" },
    });
    fireEvent.change(screen.getByLabelText("Geburtsdatum"), {
      target: { value: "2013-04-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Anlegen & einchecken/i }));

    await waitFor(() => expect(addParticipant).toHaveBeenCalledTimes(1));
    expect(addParticipant).toHaveBeenCalledWith("t1", "Luuk", "2013-04-10", "", []);
  });

  it("keeps an empty captain from ever reaching the action", () => {
    render(<AddParticipantForm tournamentId="t1" teamSize={3} />);
    openForm(/Team nachmelden/i);

    fireEvent.change(screen.getByLabelText("Teamname"), {
      target: { value: "Team Leer" },
    });
    fireEvent.change(screen.getByLabelText("Geburtsdatum Captain"), {
      target: { value: "2013-04-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Anlegen & einchecken/i }));

    // required on the captain field: the browser stops this before the server
    // has to. The action's own check stays as the backstop for other callers.
    expect(addParticipant).not.toHaveBeenCalled();
  });

  it("shows the action's error and does not refresh", async () => {
    addParticipant.mockResolvedValue({
      error: "Teilnehmer konnte nicht angelegt werden.",
    });
    render(<AddParticipantForm tournamentId="t1" teamSize={3} />);
    openForm(/Team nachmelden/i);

    fireEvent.change(screen.getByLabelText("Teamname"), {
      target: { value: "Team Rakete" },
    });
    fireEvent.change(screen.getByLabelText("Geburtsdatum Captain"), {
      target: { value: "2013-04-10" },
    });
    fireEvent.change(screen.getByLabelText("Captain"), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Anlegen & einchecken/i }));

    expect(
      await screen.findByText("Teilnehmer konnte nicht angelegt werden."),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
