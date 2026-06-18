/**
 * Unit tests for the members/actions.ts server actions.
 *
 * Mocks @/lib/auth/staff so no real Supabase connection is needed.
 * The "use server" directive is harmless in the test environment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only so it doesn't blow up in jsdom ──────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock @/lib/auth/staff ─────────────────────────────────────────────────────

type MockSupabase = {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

let mockSupabase: MockSupabase;
let requireAdminResult:
  | { supabase: MockSupabase; orgId: string }
  | { error: string };

vi.mock("@/lib/auth/staff", () => ({
  requireAdmin: () => Promise.resolve(requireAdminResult),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Configure requireAdmin to succeed and set up the supabase mocks. */
function setupAdmin(
  fromImpl: (table: string) => unknown,
  rpcImpl?: (fn: string, args: unknown) => unknown,
) {
  mockSupabase = {
    from: vi.fn().mockImplementation(fromImpl),
    rpc: vi.fn().mockImplementation(rpcImpl ?? (() => Promise.resolve({ error: null }))),
  };
  requireAdminResult = { supabase: mockSupabase, orgId: "org-1" };
}

// ── createInvite ──────────────────────────────────────────────────────────────

describe("createInvite", () => {
  beforeEach(() => {
    setupAdmin(() => ({}));
  });

  it("propagates requireAdmin auth error", async () => {
    requireAdminResult = { error: "Nicht angemeldet." };
    const { createInvite } = await import("./actions");
    const result = await createInvite("organizer");
    expect(result).toEqual({ error: "Nicht angemeldet." });
  });

  it("returns ok when insert succeeds", async () => {
    setupAdmin((table: string) => {
      if (table === "org_invites") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return {};
    });
    const { createInvite } = await import("./actions");
    const result = await createInvite("organizer");
    expect(result).toEqual({ ok: true });
  });

  it("inserts the correct fields including org_id, role, code, and expires_at", async () => {
    let insertedData: Record<string, unknown> | null = null;
    setupAdmin((table: string) => {
      if (table === "org_invites") {
        return {
          insert: (data: Record<string, unknown>) => {
            insertedData = data;
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    });
    const { createInvite } = await import("./actions");
    await createInvite("referee");
    expect(insertedData).not.toBeNull();
    expect(insertedData!.org_id).toBe("org-1");
    expect(insertedData!.role).toBe("referee");
    expect(typeof insertedData!.code).toBe("string");
    expect(typeof insertedData!.expires_at).toBe("string");
  });

  it("returns friendly error when insert fails", async () => {
    setupAdmin((table: string) => {
      if (table === "org_invites") {
        return {
          insert: () =>
            Promise.resolve({
              error: { code: "08006", message: "connection failure" },
            }),
        };
      }
      return {};
    });
    const { createInvite } = await import("./actions");
    const result = await createInvite("organizer");
    expect(result).toEqual({ error: "Einladung konnte nicht erstellt werden (nur Admin)." });
  });
});

// ── revokeInvite ──────────────────────────────────────────────────────────────

describe("revokeInvite", () => {
  beforeEach(() => {
    setupAdmin(() => ({}));
  });

  it("propagates requireAdmin auth error", async () => {
    requireAdminResult = { error: "Diese Aktion ist nicht erlaubt." };
    const { revokeInvite } = await import("./actions");
    const result = await revokeInvite("inv-1");
    expect(result).toEqual({ error: "Diese Aktion ist nicht erlaubt." });
  });

  it("calls delete with both id and org_id predicates", async () => {
    const eqCalls: Array<[string, string]> = [];
    setupAdmin((table: string) => {
      if (table === "org_invites") {
        const builder = {
          delete: () => builder,
          eq: (col: string, val: string) => {
            eqCalls.push([col, val]);
            return col === "org_id"
              ? Promise.resolve({ error: null })
              : builder;
          },
        };
        return builder;
      }
      return {};
    });
    const { revokeInvite } = await import("./actions");
    const result = await revokeInvite("inv-42");
    expect(result).toEqual({ ok: true });
    expect(eqCalls).toContainEqual(["id", "inv-42"]);
    expect(eqCalls).toContainEqual(["org_id", "org-1"]);
  });

  it("returns friendly error when delete fails", async () => {
    setupAdmin((table: string) => {
      if (table === "org_invites") {
        const builder = {
          delete: () => builder,
          eq: (_col: string, _val: string) =>
            builder.eq === undefined
              ? Promise.resolve({ error: { code: "08006", message: "fail" } })
              : { ...builder, eq: undefined },
        };
        // simpler: just return error on any eq call chain
        return {
          delete: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ error: { code: "08006", message: "fail" } }),
            }),
          }),
        };
      }
      return {};
    });
    const { revokeInvite } = await import("./actions");
    const result = await revokeInvite("inv-1");
    expect(result).toEqual({ error: "Einladung konnte nicht widerrufen werden." });
  });
});

// ── setMemberRole ─────────────────────────────────────────────────────────────

describe("setMemberRole", () => {
  beforeEach(() => {
    setupAdmin(() => ({}));
  });

  it("propagates requireAdmin auth error", async () => {
    requireAdminResult = { error: "Diese Aktion ist nicht erlaubt." };
    const { setMemberRole } = await import("./actions");
    const result = await setMemberRole("user-1", "organizer");
    expect(result).toEqual({ error: "Diese Aktion ist nicht erlaubt." });
  });

  it("calls rpc set_member_role with correct arguments", async () => {
    let capturedFn: string | null = null;
    let capturedArgs: unknown = null;
    setupAdmin(
      () => ({}),
      (fn: string, args: unknown) => {
        capturedFn = fn;
        capturedArgs = args;
        return Promise.resolve({ error: null });
      },
    );
    const { setMemberRole } = await import("./actions");
    const result = await setMemberRole("user-42", "referee");
    expect(result).toEqual({ ok: true });
    expect(capturedFn).toBe("set_member_role");
    expect(capturedArgs).toEqual({ p_member: "user-42", p_role: "referee" });
  });

  it("returns friendly error when rpc fails", async () => {
    const rpcErr = vi.fn().mockResolvedValue({ error: { code: "08006", message: "connection failure" } });
    mockSupabase = { from: vi.fn().mockImplementation(() => ({})), rpc: rpcErr };
    requireAdminResult = { supabase: mockSupabase, orgId: "org-1" };
    const { setMemberRole } = await import("./actions");
    const result = await setMemberRole("user-1", "organizer");
    expect(result).toEqual({ error: "Rolle konnte nicht geändert werden." });
  });
});

// ── removeMember ──────────────────────────────────────────────────────────────

describe("removeMember", () => {
  beforeEach(() => {
    setupAdmin(() => ({}));
  });

  it("propagates requireAdmin auth error", async () => {
    requireAdminResult = { error: "Diese Aktion ist nicht erlaubt." };
    const { removeMember } = await import("./actions");
    const result = await removeMember("user-1");
    expect(result).toEqual({ error: "Diese Aktion ist nicht erlaubt." });
  });

  it("calls rpc remove_member with correct argument", async () => {
    let capturedFn: string | null = null;
    let capturedArgs: unknown = null;
    setupAdmin(
      () => ({}),
      (fn: string, args: unknown) => {
        capturedFn = fn;
        capturedArgs = args;
        return Promise.resolve({ error: null });
      },
    );
    const { removeMember } = await import("./actions");
    const result = await removeMember("user-99");
    expect(result).toEqual({ ok: true });
    expect(capturedFn).toBe("remove_member");
    expect(capturedArgs).toEqual({ p_member: "user-99" });
  });

  it("returns friendly error when rpc fails", async () => {
    const rpcErr = vi.fn().mockResolvedValue({ error: { code: "08006", message: "connection failure" } });
    mockSupabase = { from: vi.fn().mockImplementation(() => ({})), rpc: rpcErr };
    requireAdminResult = { supabase: mockSupabase, orgId: "org-1" };
    const { removeMember } = await import("./actions");
    const result = await removeMember("user-1");
    expect(result).toEqual({ error: "Mitglied konnte nicht entfernt werden." });
  });
});
