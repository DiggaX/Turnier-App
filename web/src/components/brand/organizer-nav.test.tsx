/**
 * Smoke tests for OrganizerNav — verifies the isAdmin conditional that gates
 * the admin-only "Organisation" nav link (security-adjacent UI disclosure).
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
  it("does NOT render the Organisation link when isAdmin is omitted", () => {
    render(<OrganizerNav />);
    expect(screen.queryByRole("link", { name: "Organisation" })).toBeNull();
  });

  it("renders the Organisation link when isAdmin={true}", () => {
    render(<OrganizerNav isAdmin={true} />);
    expect(
      screen.getByRole("link", { name: "Organisation" }),
    ).toBeInTheDocument();
  });

  // A referee who cannot reach their own password page is locked out with no
  // recourse, and nothing else in the UI would show it.
  it("renders the Passwort link for non-admins", () => {
    render(<OrganizerNav />);
    expect(screen.getByRole("link", { name: "Passwort" })).toBeInTheDocument();
  });
});
