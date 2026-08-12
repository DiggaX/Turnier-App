/**
 * Unit tests for generateBracket's single-INSERT bracket wiring.
 *
 * Generieren schrieb frueher zweiphasig: INSERT + .select() der DB-ids, dann
 * pro Winner-/Loser-Link ein einzelnes UPDATE — bei Double-Elim ~20
 * sequenzielle Roundtrips. Jetzt vergibt der Client die ids selbst
 * (crypto.randomUUID), verdrahtet die Links in-memory und schickt EIN INSERT.
 * Diese Tests pinnen fest: der Insert-Payload traegt die Links bereits, und
 * der Generate-Pfad ruft nie update() auf matches auf.
 */
import { describe, it, expect, vi } from "vitest";

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

let mockClient: MockClient;

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockClient),
}));

/** The shape of a row as generateBracket hands it to insert(). */
interface InsertedRow {
  id: string;
  bracket: string;
  round: number;
  slot: number;
  next_match_id?: string | null;
  next_slot?: string | null;
  loser_next_match_id?: string | null;
  loser_next_slot?: string | null;
}

/**
 * Full run for a double_elim tournament with four checked-in competitors
 * (power of two — the generator insists). Status "running" so step 5 writes
 * nothing and the matches table is the only thing written.
 */
function setupDoubleElim() {
  let insertedRows: InsertedRow[] | null = null;
  const matchesInsert = vi.fn().mockImplementation((rows: InsertedRow[]) => {
    insertedRows = rows;
    return Promise.resolve({ error: null });
  });
  const matchesUpdate = vi.fn();

  mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { role: "organizer" }, error: null }),
            }),
          }),
        };
      }
      if (table === "tournaments") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "t1", format: "double_elim", status: "running" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "participants") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                not: () => ({
                  order: () => ({
                    order: () =>
                      Promise.resolve({
                        data: [1, 2, 3, 4].map((s) => ({
                          id: `p${s}`,
                          seed: s,
                          created_at: `2026-08-12T09:0${s}:00Z`,
                        })),
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "matches") {
        return {
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          insert: matchesInsert,
          update: matchesUpdate,
        };
      }
      return {};
    }),
  };

  return {
    matchesInsert,
    matchesUpdate,
    rows: () => insertedRows ?? [],
  };
}

describe("generateBracket double-elim single-insert wiring", () => {
  it("ships winner AND loser links inside the one insert payload", async () => {
    const { matchesInsert, rows } = setupDoubleElim();
    const { generateBracket } = await import("./actions");

    expect(await generateBracket("t1", { discardResults: true })).toEqual({
      ok: true,
    });
    expect(matchesInsert).toHaveBeenCalledTimes(1);

    // 4 players: WB 2+1, LB 1+1, GF 1 = 6 matches, each with its own id.
    const payload = rows();
    expect(payload).toHaveLength(6);
    const ids = new Set(payload.map((r) => r.id));
    expect(ids.size).toBe(6);
    for (const id of ids) expect(id).toEqual(expect.any(String));

    // Every match except the grand final advances its winner somewhere —
    // and only to an id inside this very batch (intra-batch self-FK).
    const linked = payload.filter((r) => r.next_match_id != null);
    expect(linked).toHaveLength(5);
    for (const r of linked) {
      expect(ids.has(r.next_match_id as string)).toBe(true);
      expect(["a", "b"]).toContain(r.next_slot);
    }

    // Every WB match drops its loser into the LB; nobody else does.
    const loserLinked = payload.filter((r) => r.loser_next_match_id != null);
    expect(loserLinked).toHaveLength(3);
    expect(loserLinked.every((r) => r.bracket === "winner")).toBe(true);
    for (const r of loserLinked) {
      expect(ids.has(r.loser_next_match_id as string)).toBe(true);
      expect(["a", "b"]).toContain(r.loser_next_slot);
    }

    // Concrete wiring spot-check on the WB final: winner -> grand final
    // (side a), loser -> LB major round 2 (side b).
    const wbFinal = payload.find((r) => r.bracket === "winner" && r.round === 2);
    const grandFinal = payload.find((r) => r.bracket === "grand_final");
    const lbMajor = payload.find((r) => r.bracket === "loser" && r.round === 2);
    expect(wbFinal?.next_match_id).toBe(grandFinal?.id);
    expect(wbFinal?.next_slot).toBe("a");
    expect(wbFinal?.loser_next_match_id).toBe(lbMajor?.id);
    expect(wbFinal?.loser_next_slot).toBe("b");
  });

  it("never calls update() on matches in the generate path", async () => {
    const { matchesUpdate } = setupDoubleElim();
    const { generateBracket } = await import("./actions");

    expect(await generateBracket("t1", { discardResults: true })).toEqual({
      ok: true,
    });
    expect(matchesUpdate).not.toHaveBeenCalled();
  });
});
