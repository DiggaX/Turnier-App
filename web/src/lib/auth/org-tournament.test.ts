/**
 * Unit tests for requireOrgTournament.
 *
 * Mocks server-only and next/navigation so the helper can run in jsdom.
 * Uses a hand-rolled Supabase client mock — no real DB connection needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock server-only ──────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

// ── Mock next/navigation so notFound() can be observed ───────────────────────
const mockNotFound = vi.fn(() => {
  // Simulate Next.js notFound() which throws internally; here we just throw
  // a sentinel so the test can assert the branch was taken.
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

// ── Supabase mock factory ─────────────────────────────────────────────────────

/** Build a minimal mock Supabase client whose `from('tournaments')` returns the given row (or null). */
function makeSupabase(row: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("requireOrgTournament", () => {
  beforeEach(() => {
    mockNotFound.mockClear();
  });

  it("throws when columns does not include org_id", async () => {
    const { requireOrgTournament } = await import("./org-tournament");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = makeSupabase(null) as any;
    await expect(
      requireOrgTournament(supabase, "t-1", "org-1", "id, name"),
    ).rejects.toThrow("requireOrgTournament: columns must include org_id");
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("calls notFound() when the tournament row is not found (data is null)", async () => {
    const { requireOrgTournament } = await import("./org-tournament");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = makeSupabase(null) as any;
    await expect(
      requireOrgTournament(supabase, "t-missing", "org-1", "id, org_id"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() when orgId is null (unassigned-org staff user)", async () => {
    const { requireOrgTournament } = await import("./org-tournament");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = makeSupabase({ id: "t-1", org_id: "org-1" }) as any;
    await expect(
      requireOrgTournament(supabase, "t-1", null, "id, org_id"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() when the tournament belongs to a different org", async () => {
    const { requireOrgTournament } = await import("./org-tournament");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = makeSupabase({ id: "t-1", org_id: "org-other" }) as any;
    await expect(
      requireOrgTournament(supabase, "t-1", "org-1", "id, org_id"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("returns the tournament data when the org matches", async () => {
    const { requireOrgTournament } = await import("./org-tournament");
    const row = { id: "t-1", name: "Spring Cup", org_id: "org-1" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = makeSupabase(row) as any;
    const result = await requireOrgTournament<{
      id: string;
      name: string;
      org_id: string;
    }>(supabase, "t-1", "org-1", "id, name, org_id");
    expect(result).toEqual(row);
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
