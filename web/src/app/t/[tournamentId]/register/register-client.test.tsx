/**
 * Die öffentliche Anmeldung, an ihren drei empfindlichen Stellen.
 *
 * 1. Sie darf nie unter einem angemeldeten Orga-Konto ausgefüllt werden — siehe
 *    @/lib/supabase/guest-session.
 * 2. Sie meldet seit dem Team-Umbau eine PERSON an, nicht ein Team: kein
 *    Captain-Feld, keine Mitgliederliste, und `type` ergibt sich aus der
 *    Teamgröße ('player' im Teamturnier, 'solo' im Einzel). Schreibt sie wieder
 *    'team', steht ein Kind namentlich im öffentlichen Board.
 * 3. Der Wiedereinstieg. Vorher war der Schritt flüchtiger React-State: nach
 *    einem Neuladen landete man wieder auf dem Formular und lief in
 *    unique(tournament_id, user_id) — mit dem Team-Code hinter der Wand.
 *
 * QrActions ist gestubbt: es rendert ein QRCodeCanvas, für das jsdom keinen
 * 2D-Kontext hat.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { STAFF_SESSION_MESSAGE } from "@/lib/supabase/guest-session";
import type { ConsentOrg } from "@/lib/consent-text";

const getSession = vi.fn();
const signInAnonymously = vi.fn();
const rpc = vi.fn();
const inserted: Record<string, unknown>[] = [];

vi.mock("@/components/qr-actions", () => ({
  QrActions: () => <div data-testid="qr-actions" />,
  participantRecoveryUrl: () => "https://example.test/me",
}));

vi.mock("@/lib/supabase/client", () => ({
  // Erst beim Rendern aufgerufen — die Konstanten oben stehen dann längst.
  createClient: () => ({
    auth: { getSession, signInAnonymously },
    rpc,
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "p-1", qr_token: "qr-1" },
                error: null,
              }),
          }),
        };
      },
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { qr_token: "qr-1" }, error: null }),
        }),
      }),
    }),
  }),
}));

import { RegisterClient } from "./register-client";

const TOURNAMENT = { id: "t-1", name: "LAN Cup" };
const ORG: ConsentOrg = { name: "Abenteuerinsel", address: "Strandweg 1" };

function sessionOf(user: { id: string; is_anonymous?: boolean } | null) {
  return { data: { session: user ? { user } : null } };
}

function renderClient(teamSize: number) {
  return render(
    <RegisterClient
      tournament={TOURNAMENT}
      teamSize={teamSize}
      org={ORG}
    />,
  );
}

/** Formular ausfüllen und abschicken; landet auf der Fotoerlaubnis. */
async function submitForm() {
  fireEvent.change(await screen.findByLabelText("Anzeigename"), {
    target: { value: "Ada" },
  });
  fireEvent.change(screen.getByLabelText("Geburtsdatum"), {
    target: { value: "2000-05-04" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Weiter zur Fotoerlaubnis/i }),
  );
}

beforeEach(() => {
  inserted.length = 0;
  getSession.mockReset().mockResolvedValue(sessionOf(null));
  signInAnonymously
    .mockReset()
    .mockResolvedValue({ data: { user: { id: "anon-1" } }, error: null });
  // Standard: diese Sitzung ist hier noch nicht angemeldet.
  rpc.mockReset().mockResolvedValue({ data: [], error: null });
});

describe("RegisterClient guest-session gate", () => {
  it("blocks the form when a staff/organizer account is signed in", async () => {
    getSession.mockResolvedValue(
      sessionOf({ id: "staff-1", is_anonymous: false }),
    );

    renderClient(1);

    expect(await screen.findByText(STAFF_SESSION_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByLabelText("Anzeigename")).toBeNull();
  });

  it("lets an anonymous guest session through to the form", async () => {
    getSession.mockResolvedValue(sessionOf({ id: "anon-1", is_anonymous: true }));

    renderClient(1);

    expect(await screen.findByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.queryByText(STAFF_SESSION_MESSAGE)).toBeNull();
  });

  it("shows the form when there is no session at all", async () => {
    getSession.mockResolvedValue(sessionOf(null));

    renderClient(1);

    expect(await screen.findByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.queryByText(STAFF_SESSION_MESSAGE)).toBeNull();
  });
});

describe("RegisterClient meldet eine Person an", () => {
  it("fragt im Teamturnier weder nach Captain noch nach Mitgliedern", async () => {
    renderClient(3);

    expect(await screen.findByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Captain/i)).toBeNull();
    expect(screen.queryByLabelText(/Mitglied 1/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Mitglied hinzufügen/i }),
    ).toBeNull();
  });

  it("schreibt type='player' im Teamturnier", async () => {
    renderClient(3);
    await submitForm();

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].type).toBe("player");
  });

  it("schreibt type='solo' im Einzelturnier", async () => {
    renderClient(1);
    await submitForm();

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].type).toBe("solo");
  });
});

describe("RegisterClient Schrittfolge", () => {
  it("zeigt im Einzelturnier keinen Team-Schritt", async () => {
    renderClient(1);
    await submitForm();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Ohne Fotoerlaubnis fortfahren/i,
      }),
    );

    // Der SaveAccessDialog liegt als Modal über dem Abschluss und macht alles
    // dahinter inert — wegklicken, sonst prüft die Abfrage unter aria-hidden.
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /gespeichert/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    expect(
      await screen.findByRole("heading", { name: /Anmeldung abgeschlossen/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team gründen" })).toBeNull();
    expect(screen.queryByLabelText("Team-Code")).toBeNull();
  });

  it("führt im Teamturnier nach der Fotoerlaubnis in den Team-Schritt", async () => {
    renderClient(3);
    await submitForm();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Ohne Fotoerlaubnis fortfahren/i,
      }),
    );

    expect(
      await screen.findByRole("button", { name: "Team gründen" }),
    ).toBeInTheDocument();
  });

  it("springt beim Wiedereinstieg direkt in den Team-Schritt statt aufs Formular", async () => {
    getSession.mockResolvedValue(sessionOf({ id: "anon-1", is_anonymous: true }));
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "get_my_registration"
          ? {
              data: [
                {
                  participant_id: "p-1",
                  display_name: "Ada",
                  participant_typ: "player",
                  checked_in: false,
                  team_id: null,
                  team_name: null,
                  join_code: null,
                  is_captain: false,
                  team_size: 3,
                  members_count: null,
                  team_ready: null,
                },
              ],
              error: null,
            }
          : { data: [], error: null },
      ),
    );

    renderClient(3);

    expect(
      await screen.findByRole("button", { name: "Team gründen" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Anzeigename")).toBeNull();
  });
});
