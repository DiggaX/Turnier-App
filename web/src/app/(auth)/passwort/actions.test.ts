/**
 * Unit tests for the password server actions.
 *
 * Two rules here are security decisions rather than conveniences, and both are
 * easy to undo by accident later — so they are pinned:
 *
 *   1. requestPasswordReset always reports success, even when Supabase fails.
 *      Reporting the real outcome would turn the form into an oracle for which
 *      addresses have an account.
 *   2. Outside a recovery window, setPassword refuses without the correct
 *      current password. An unlocked phone on the desk at a tournament must not
 *      be enough to take an account over.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/lib/origin", () => ({
  getOrigin: () => Promise.resolve("https://example.test"),
}));

/** Stands in for the pw_recovery cookie set by /auth/confirm. */
let viaRecovery = false;
const mockCookieDelete = vi.fn();
vi.mock("@/lib/auth/recovery", () => ({
  RECOVERY_COOKIE: "pw_recovery",
  RECOVERY_COOKIE_MAX_AGE: 900,
  hasRecoveryCookie: () => Promise.resolve(viaRecovery),
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ delete: (n: string) => mockCookieDelete(n) }),
}));

let mockResetPasswordForEmail: ReturnType<typeof vi.fn>;
let mockGetUser: ReturnType<typeof vi.fn>;
let mockSignInWithPassword: ReturnType<typeof vi.fn>;
let mockUpdateUser: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        resetPasswordForEmail: (...a: unknown[]) =>
          mockResetPasswordForEmail(...a),
        getUser: () => mockGetUser(),
        signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a),
        updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      },
    }),
}));

/** Build a FormData with the given fields. */
function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  viaRecovery = false;
  mockResetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  mockGetUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: "u1", email: "a@example.com" } } });
  mockSignInWithPassword = vi.fn().mockResolvedValue({ error: null });
  mockUpdateUser = vi.fn().mockResolvedValue({ error: null });
});

describe("requestPasswordReset", () => {
  it("rejects an empty address without calling Supabase", async () => {
    const { requestPasswordReset } = await import("./actions");
    const result = await requestPasswordReset({}, makeForm({ email: "  " }));
    expect(result).toEqual({ error: "Bitte eine E-Mail-Adresse eingeben." });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("reports success even when Supabase errors, so the form is no address oracle", async () => {
    mockResetPasswordForEmail.mockResolvedValue({
      error: { message: "User not found" },
    });
    const { requestPasswordReset } = await import("./actions");
    const result = await requestPasswordReset(
      {},
      makeForm({ email: "ghost@example.com" }),
    );
    expect(result).toEqual({ sent: true });
  });

  it("stamps type=recovery on the redirect so /auth/confirm can route it", async () => {
    const { requestPasswordReset } = await import("./actions");
    await requestPasswordReset({}, makeForm({ email: "a@example.com" }));
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("a@example.com", {
      redirectTo: "https://example.test/auth/confirm?type=recovery",
    });
  });
});

describe("setPassword", () => {
  it("rejects a password under 8 characters", async () => {
    const { setPassword } = await import("./actions");
    const result = await setPassword(
      {},
      makeForm({ password: "short", passwordRepeat: "short" }),
    );
    expect(result).toEqual({ error: "Passwort braucht mindestens 8 Zeichen." });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects a mismatched repeat", async () => {
    const { setPassword } = await import("./actions");
    const result = await setPassword(
      {},
      makeForm({ password: "password123", passwordRepeat: "password124" }),
    );
    expect(result).toEqual({
      error: "Die beiden Passwörter stimmen nicht überein.",
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects when there is no session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { setPassword } = await import("./actions");
    const result = await setPassword(
      {},
      makeForm({ password: "password123", passwordRepeat: "password123" }),
    );
    expect(result).toEqual({
      error: "Sitzung abgelaufen. Bitte fordere den Link neu an.",
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("refuses a change when the current password is wrong", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: "nope" } });
    const { setPassword } = await import("./actions");
    const result = await setPassword(
      {},
      makeForm({
        currentPassword: "wrong-one",
        password: "password123",
        passwordRepeat: "password123",
      }),
    );
    expect(result).toEqual({ error: "Das aktuelle Passwort stimmt nicht." });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("refuses a change when no current password is supplied", async () => {
    const { setPassword } = await import("./actions");
    const result = await setPassword(
      {},
      makeForm({ password: "password123", passwordRepeat: "password123" }),
    );
    expect(result).toEqual({ error: "Bitte das aktuelle Passwort eingeben." });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("changes the password once the current one checks out", async () => {
    const { setPassword } = await import("./actions");
    await setPassword(
      {},
      makeForm({
        currentPassword: "old-password",
        password: "password123",
        passwordRepeat: "password123",
      }),
    );
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "a@example.com",
      password: "old-password",
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mockRedirect).toHaveBeenCalledWith("/organizer");
  });

  it("skips the current-password check inside a recovery window", async () => {
    viaRecovery = true;
    const { setPassword } = await import("./actions");
    await setPassword(
      {},
      makeForm({ password: "password123", passwordRepeat: "password123" }),
    );
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "password123" });
    expect(mockRedirect).toHaveBeenCalledWith("/organizer");
  });

  it("burns the recovery cookie after a successful reset", async () => {
    viaRecovery = true;
    const { setPassword } = await import("./actions");
    await setPassword(
      {},
      makeForm({ password: "password123", passwordRepeat: "password123" }),
    );
    expect(mockCookieDelete).toHaveBeenCalledWith("pw_recovery");
  });

  it("keeps the password when Supabase rejects the update", async () => {
    viaRecovery = true;
    mockUpdateUser.mockResolvedValue({ error: { message: "weak" } });
    const { setPassword } = await import("./actions");
    const result = await setPassword(
      {},
      makeForm({ password: "password123", passwordRepeat: "password123" }),
    );
    expect(result).toEqual({ error: "Passwort konnte nicht geändert werden." });
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
