/**
 * Unit tests for the signup server actions.
 *
 * Mocks @/lib/supabase/server and @supabase/supabase-js so no real Supabase
 * connection is needed. Mocks next/navigation so redirect() is a no-op spy.
 * The "use server" directive is harmless in the test environment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only so it doesn't blow up in jsdom ──────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock next/navigation so redirect() is a no-op spy ────────────────────────
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// ── Mock @/lib/supabase/server (anon client) ──────────────────────────────────

type MockRpc = ReturnType<typeof vi.fn>;

let mockSignUp: ReturnType<typeof vi.fn>;
let mockRpc: MockRpc;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        signUp: (...args: unknown[]) => mockSignUp(...args),
      },
      rpc: (...args: unknown[]) => mockRpc(...args),
    }),
}));

// ── Mock @supabase/supabase-js (admin client for orphan cleanup) ──────────────

const mockDeleteUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        deleteUser: (id: string) => mockDeleteUser(id),
      },
    },
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a FormData with the given fields. */
function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Minimal valid form data for signUpCreateOrg. */
const validOrgForm = makeForm({
  email: "alice@example.com",
  password: "password123",
  orgName: "Acme GmbH",
});

/** Minimal valid form data for signUpAcceptInvite. */
const validInviteForm = makeForm({
  email: "bob@example.com",
  password: "password123",
  code: "invite-code-abc",
});

// ── signUpCreateOrg ───────────────────────────────────────────────────────────

describe("signUpCreateOrg", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockDeleteUser.mockResolvedValue({ error: null });
    // Default: signUp succeeds with a user id
    mockSignUp = vi.fn().mockResolvedValue({ data: { user: { id: "uid-1" } }, error: null });
    // Default: RPC succeeds
    mockRpc = vi.fn().mockResolvedValue({ error: null });
  });

  it("returns error when orgName is empty — signUp is NOT called", async () => {
    const { signUpCreateOrg } = await import("./actions");
    const form = makeForm({ email: "alice@example.com", password: "password123", orgName: "" });
    const result = await signUpCreateOrg({}, form);
    expect(result).toEqual({ error: "Firmenname erforderlich." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error when orgName produces no valid slug — signUp is NOT called", async () => {
    const { signUpCreateOrg } = await import("./actions");
    const form = makeForm({ email: "alice@example.com", password: "password123", orgName: "---" });
    const result = await signUpCreateOrg({}, form);
    expect(result).toEqual({ error: "Firmenname ergibt keinen gültigen Namen." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error when email is empty — signUp is NOT called", async () => {
    const { signUpCreateOrg } = await import("./actions");
    const form = makeForm({ email: "", password: "password123", orgName: "Acme GmbH" });
    const result = await signUpCreateOrg({}, form);
    expect(result).toEqual({ error: "E-Mail und ein Passwort (min. 8 Zeichen) erforderlich." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error for invalid email format — signUp is NOT called", async () => {
    const { signUpCreateOrg } = await import("./actions");
    const form = makeForm({ email: "notanemail", password: "password123", orgName: "Acme GmbH" });
    const result = await signUpCreateOrg({}, form);
    expect(result).toEqual({ error: "Ungültige E-Mail-Adresse." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error when password is too short — signUp is NOT called", async () => {
    const { signUpCreateOrg } = await import("./actions");
    const form = makeForm({ email: "alice@example.com", password: "short", orgName: "Acme GmbH" });
    const result = await signUpCreateOrg({}, form);
    expect(result).toEqual({ error: "E-Mail und ein Passwort (min. 8 Zeichen) erforderlich." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error when signUp fails — bootstrap_org RPC is NOT called", async () => {
    mockSignUp = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "Email taken" } });
    const { signUpCreateOrg } = await import("./actions");
    const result = await signUpCreateOrg({}, validOrgForm);
    expect(result).toEqual({
      error: "Registrierung fehlgeschlagen. E-Mail evtl. schon vergeben.",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("cleans up orphaned auth user and returns error when bootstrap_org RPC fails", async () => {
    mockRpc = vi.fn().mockResolvedValue({ error: { code: "23505", message: "slug collision" } });
    const { signUpCreateOrg } = await import("./actions");
    const result = await signUpCreateOrg({}, validOrgForm);
    expect(result).toEqual({
      error: "Organisation konnte nicht angelegt werden. Bitte versuche es erneut.",
    });
    // The orphaned auth user must be deleted
    expect(mockDeleteUser).toHaveBeenCalledWith("uid-1");
  });

  it("calls redirect('/organizer') on success", async () => {
    const { signUpCreateOrg } = await import("./actions");
    await signUpCreateOrg({}, validOrgForm);
    expect(mockRedirect).toHaveBeenCalledWith("/organizer");
  });

  it("calls bootstrap_org with the correct org name and slug", async () => {
    const { signUpCreateOrg } = await import("./actions");
    await signUpCreateOrg({}, validOrgForm);
    expect(mockRpc).toHaveBeenCalledWith("bootstrap_org", {
      p_name: "Acme GmbH",
      p_slug: "acme-gmbh",
    });
  });
});

// ── signUpAcceptInvite ────────────────────────────────────────────────────────

describe("signUpAcceptInvite", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockDeleteUser.mockResolvedValue({ error: null });
    // Default: signUp succeeds
    mockSignUp = vi.fn().mockResolvedValue({ data: { user: { id: "uid-2" } }, error: null });
    // Default: RPC succeeds
    mockRpc = vi.fn().mockResolvedValue({ error: null });
  });

  it("returns error when invite code is empty — signUp is NOT called", async () => {
    const { signUpAcceptInvite } = await import("./actions");
    const form = makeForm({ email: "bob@example.com", password: "password123", code: "" });
    const result = await signUpAcceptInvite({}, form);
    expect(result).toEqual({ error: "Einladungscode fehlt." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error for invalid email format — signUp is NOT called", async () => {
    const { signUpAcceptInvite } = await import("./actions");
    const form = makeForm({ email: "notanemail", password: "password123", code: "abc" });
    const result = await signUpAcceptInvite({}, form);
    expect(result).toEqual({ error: "Ungültige E-Mail-Adresse." });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns error when signUp fails — accept_invite RPC is NOT called", async () => {
    mockSignUp = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "Email taken" } });
    const { signUpAcceptInvite } = await import("./actions");
    const result = await signUpAcceptInvite({}, validInviteForm);
    expect(result).toEqual({
      error: "Registrierung fehlgeschlagen. E-Mail evtl. schon vergeben.",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("cleans up orphaned auth user and returns error when accept_invite RPC fails", async () => {
    mockRpc = vi.fn().mockResolvedValue({ error: { code: "P0001", message: "invite expired" } });
    const { signUpAcceptInvite } = await import("./actions");
    const result = await signUpAcceptInvite({}, validInviteForm);
    expect(result).toEqual({
      error: "Einladung konnte nicht eingelöst werden (ungültig/abgelaufen?).",
    });
    // The orphaned auth user must be deleted
    expect(mockDeleteUser).toHaveBeenCalledWith("uid-2");
  });

  it("calls redirect('/organizer') on success", async () => {
    const { signUpAcceptInvite } = await import("./actions");
    await signUpAcceptInvite({}, validInviteForm);
    expect(mockRedirect).toHaveBeenCalledWith("/organizer");
  });

  it("calls accept_invite with the correct invite code", async () => {
    const { signUpAcceptInvite } = await import("./actions");
    await signUpAcceptInvite({}, validInviteForm);
    expect(mockRpc).toHaveBeenCalledWith("accept_invite", { p_code: "invite-code-abc" });
  });
});
