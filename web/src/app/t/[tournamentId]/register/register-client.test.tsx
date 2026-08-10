/**
 * The register page must never be filled in under a signed-in staff/organizer
 * account — see @/lib/supabase/guest-session for why. This covers the mount
 * check that surfaces that before the form is typed, and that an ordinary
 * guest session is still let straight through.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { STAFF_SESSION_MESSAGE } from "@/lib/supabase/guest-session";

const getSession = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession, signInAnonymously: vi.fn() },
  }),
}));

import { RegisterClient } from "./register-client";

const TOURNAMENT = { id: "t-1", name: "LAN Cup" };

function sessionOf(user: { id: string; is_anonymous?: boolean } | null) {
  return { data: { session: user ? { user } : null } };
}

beforeEach(() => {
  getSession.mockReset();
});

describe("RegisterClient guest-session gate", () => {
  it("blocks the form when a staff/organizer account is signed in", async () => {
    getSession.mockResolvedValue(
      sessionOf({ id: "staff-1", is_anonymous: false }),
    );

    render(<RegisterClient tournament={TOURNAMENT} teamSize={1} />);

    expect(await screen.findByText(STAFF_SESSION_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByLabelText("Anzeigename")).toBeNull();
  });

  it("lets an anonymous guest session through to the form", async () => {
    getSession.mockResolvedValue(sessionOf({ id: "anon-1", is_anonymous: true }));

    render(<RegisterClient tournament={TOURNAMENT} teamSize={1} />);

    expect(await screen.findByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.queryByText(STAFF_SESSION_MESSAGE)).toBeNull();
  });

  it("shows the form when there is no session at all", async () => {
    getSession.mockResolvedValue(sessionOf(null));

    render(<RegisterClient tournament={TOURNAMENT} teamSize={1} />);

    expect(await screen.findByLabelText("Anzeigename")).toBeInTheDocument();
    expect(screen.queryByText(STAFF_SESSION_MESSAGE)).toBeNull();
  });
});
