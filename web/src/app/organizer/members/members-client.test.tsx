/**
 * Covers how a member row renders per role. The role <select> only carries
 * organizer/referee, so an admin row must not use it: a select silently falls
 * back to its first option, which would display a fellow admin as "organizer"
 * and offer controls to demote or remove them.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  createInvite: vi.fn(),
  removeMember: vi.fn(),
  revokeInvite: vi.fn(),
  setMemberRole: vi.fn(),
}));

import { MembersClient } from "./members-client";

const ADMIN = { id: "admin-1", role: "admin", display_name: "Rene" };
const ORGANIZER = { id: "user-2", role: "organizer", display_name: "Bea" };

function renderMembers(members: typeof ADMIN[]) {
  render(
    <MembersClient
      members={members}
      invites={[]}
      currentUserId="someone-else"
      origin="https://example.test"
    />,
  );
}

describe("MembersClient role column", () => {
  it("shows an admin's role as text, not as an editable dropdown", () => {
    renderMembers([ADMIN]);
    expect(screen.queryByRole("combobox", { name: /Rolle von Rene/ })).toBeNull();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("offers no remove button for an admin", () => {
    renderMembers([ADMIN]);
    expect(screen.queryByRole("button", { name: "Entfernen" })).toBeNull();
  });

  it("still lets a non-admin member be edited and removed", () => {
    renderMembers([ORGANIZER]);
    expect(
      screen.getByRole("combobox", { name: /Rolle von Bea/ }),
    ).toHaveValue("organizer");
    expect(
      screen.getByRole("button", { name: "Entfernen" }),
    ).toBeInTheDocument();
  });
});
