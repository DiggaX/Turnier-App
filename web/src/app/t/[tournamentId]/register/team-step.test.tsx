/**
 * Der Team-Schritt an den zwei Stellen, an denen er trägt.
 *
 * Gründen: der Code muss danach auf dem Schirm stehen. Er ist das einzige, was
 * die Mitspieler von diesem Team je zu sehen bekommen — bleibt er weg, ist das
 * Team nicht beitretbar und der Gründer weiß es nicht einmal.
 *
 * Beitreten mit falschem Code: die Meldung kommt aus der Datenbank und ist für
 * Endnutzer geschrieben ("Diesen Team-Code gibt es hier nicht.", "Dieses Team
 * ist schon vollzählig (3 von 3)."). Sie durch ein eigenes "Fehler" zu ersetzen
 * nimmt genau die Auskunft weg, die weiterhilft.
 *
 * Supabase kommt als Prop — nichts zu mocken außer den beiden RPC-Antworten.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { TeamStep } from "./team-step";

const rpc = vi.fn();
const onDone = vi.fn();

const supabase = { rpc } as unknown as SupabaseClient<Database>;

const REG_WITH_TEAM = {
  participant_id: "p-1",
  display_name: "Ada",
  participant_typ: "player",
  checked_in: false,
  team_id: "team-1",
  team_name: "Team Rakete",
  join_code: "K7X2QD",
  is_captain: true,
  team_size: 3,
  members_count: 1,
  team_ready: false,
};

const ME = {
  member_id: "p-1",
  member_name: "Ada",
  member_gamertag: null,
  member_is_captain: true,
  member_checked_in: false,
  member_is_me: true,
};

function renderStep() {
  return render(
    <TeamStep
      supabase={supabase}
      tournamentId="t-1"
      teamSize={3}
      initialTeam={null}
      onDone={onDone}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe("TeamStep", () => {
  it("zeigt den Team-Code, nachdem das Team gegründet wurde", async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "get_my_registration"
          ? { data: [REG_WITH_TEAM], error: null }
          : fn === "get_my_team"
            ? { data: [ME], error: null }
            : { data: [{ team_id: "team-1", join_code: "K7X2QD" }], error: null },
      ),
    );

    renderStep();

    fireEvent.change(screen.getByLabelText("Teamname"), {
      target: { value: "Team Rakete" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Team gründen" }));

    expect(await screen.findByText("K7X2QD")).toBeInTheDocument();
    expect(screen.getByText("Team Rakete")).toBeInTheDocument();
    expect(screen.getByText(/1 von 3/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("create_team", {
      p_tournament_id: "t-1",
      p_name: "Team Rakete",
    });
  });

  it("wirft das Team nicht weg, wenn die Nachlese fehlschlägt", async () => {
    // get_my_registration liefert bei einem Fehler data: null. Wird das als
    // "kein Team" gelesen, steht der Gründer wieder vor dem leeren Formular,
    // gründet erneut, bekommt "Du bist bereits in einem Team" — und tritt aus.
    // Damit ist das Team samt weitergegebenem Code gelöscht.
    rpc.mockResolvedValue({ data: null, error: { message: "network" } });

    render(
      <TeamStep
        supabase={supabase}
        tournamentId="t-1"
        teamSize={3}
        initialTeam={{
          id: "team-1",
          name: "Team Rakete",
          joinCode: "K7X2QD",
          isCaptain: true,
        }}
        onDone={onDone}
      />,
    );

    expect(
      await screen.findByText(/konnte nicht geladen werden/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Team Rakete")).toBeInTheDocument();
    expect(screen.getByText("K7X2QD")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team gründen" })).toBeNull();
  });

  it("zeigt beim Beitritt die Meldung der Datenbank statt einer eigenen", async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "join_team"
          ? {
              data: null,
              error: { message: "Diesen Team-Code gibt es hier nicht." },
            }
          : { data: [], error: null },
      ),
    );

    renderStep();

    fireEvent.change(screen.getByLabelText("Team-Code"), {
      target: { value: "zzz zzz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Team beitreten" }));

    expect(
      await screen.findByText("Diesen Team-Code gibt es hier nicht."),
    ).toBeInTheDocument();
    // Grossbuchstaben und ohne Leerzeichen: die RPC trimmt nur aussen, ein
    // vorgelesener Code kommt aber gern mit Luecken an.
    expect(rpc).toHaveBeenCalledWith("join_team", {
      p_tournament_id: "t-1",
      p_code: "ZZZZZZ",
    });
  });
});
