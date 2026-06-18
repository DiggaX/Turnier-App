/**
 * Smoke tests for OrganizerNav — verifies the isAdmin conditional that gates
 * the admin-only "Mitglieder" nav link (security-adjacent UI disclosure).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrganizerNav } from "./organizer-nav";

// The component imports a "use server" action; mock the module so vitest can
// render OrganizerNav without a Next.js server runtime.
vi.mock("@/app/(auth)/login/actions", () => ({
  signOut: vi.fn(),
}));

describe("OrganizerNav", () => {
  it("does NOT render the Mitglieder link when isAdmin is omitted", () => {
    render(<OrganizerNav />);
    expect(screen.queryByRole("link", { name: "Mitglieder" })).toBeNull();
  });

  it("renders the Mitglieder link when isAdmin={true}", () => {
    render(<OrganizerNav isAdmin={true} />);
    expect(
      screen.getByRole("link", { name: "Mitglieder" }),
    ).toBeInTheDocument();
  });
});
