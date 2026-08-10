import { describe, it, expect, vi } from "vitest";
import {
  ensureGuestSession,
  isGuestUser,
  STAFF_SESSION_MESSAGE,
} from "@/lib/supabase/guest-session";

type User = { id: string; is_anonymous?: boolean };

/** Minimal stand-in for `supabase.auth` with the two calls this rule uses. */
function fakeAuth(user: User | null, signedIn: User | null = { id: "anon-new" }) {
  return {
    getSession: vi.fn().mockResolvedValue({
      data: { session: user ? { user } : null },
    }),
    signInAnonymously: vi
      .fn()
      .mockResolvedValue({ data: { user: signedIn }, error: null }),
  };
}

describe("isGuestUser", () => {
  it("is true only for an explicitly anonymous user", () => {
    expect(isGuestUser({ id: "a", is_anonymous: true })).toBe(true);
    expect(isGuestUser({ id: "a", is_anonymous: false })).toBe(false);
    expect(isGuestUser({ id: "a" })).toBe(false); // flag missing -> not a guest
    expect(isGuestUser(null)).toBe(false);
  });
});

describe("ensureGuestSession", () => {
  it("signs in anonymously when there is no session", async () => {
    const auth = fakeAuth(null);
    await expect(ensureGuestSession(auth)).resolves.toBe("anon-new");
    expect(auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("reuses an anonymous session (same guest, second tournament)", async () => {
    const auth = fakeAuth({ id: "anon-1", is_anonymous: true });
    await expect(ensureGuestSession(auth)).resolves.toBe("anon-1");
    // Reusing matters: a fresh anonymous user would lock the guest out of
    // every earlier registration, whose RLS keys off the old user_id.
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("refuses a staff/organizer session instead of registering it", async () => {
    const auth = fakeAuth({ id: "staff-1", is_anonymous: false });
    await expect(ensureGuestSession(auth)).rejects.toThrow(
      STAFF_SESSION_MESSAGE,
    );
    // And does not silently replace it — that would sign the organizer out of
    // their own dashboard.
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("refuses a session whose is_anonymous flag is missing", async () => {
    const auth = fakeAuth({ id: "unknown-1" });
    await expect(ensureGuestSession(auth)).rejects.toThrow(
      STAFF_SESSION_MESSAGE,
    );
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("reports a friendly error when anonymous sign-in fails", async () => {
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInAnonymously: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: new Error("boom") }),
    };
    await expect(ensureGuestSession(auth)).rejects.toThrow(
      "Anmeldung konnte nicht gestartet werden",
    );
  });
});
