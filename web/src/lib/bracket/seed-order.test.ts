import { describe, it, expect } from "vitest";
import { seedOrder } from "@/lib/bracket/seed-order";

describe("seedOrder", () => {
  it("returns [1] for size 1", () => {
    expect(seedOrder(1)).toEqual([1]);
  });

  it("returns [1,2] for size 2", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
  });

  it("returns [1,4,2,3] for size 4", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("returns [1,8,4,5,2,7,3,6] for size 8", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it.each([2, 4, 8, 16])(
    "is a permutation of 1..size with adjacent pairs summing to size+1 (size=%i)",
    (size) => {
      const out = seedOrder(size);
      expect(out).toHaveLength(size);

      // permutation of 1..size
      const sorted = [...out].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: size }, (_, i) => i + 1));

      // every adjacent pair sums to size+1
      for (let k = 0; k < size / 2; k++) {
        expect(out[2 * k] + out[2 * k + 1]).toBe(size + 1);
      }
    },
  );
});
