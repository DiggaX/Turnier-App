/**
 * Standard bracket slot order for a power-of-2 `size`.
 *
 * Recursive definition:
 *   seedOrder(1) = [1]
 *   seedOrder(2) = [1, 2]
 *   for larger sizes, map each x in seedOrder(size/2) to [x, size + 1 - x]
 *   and flatten.
 *
 * The result is a permutation of 1..size where every adjacent pair
 * (out[2k], out[2k+1]) sums to size + 1, i.e. the top seed always faces
 * the bottom seed, ensuring the strongest seeds meet as late as possible.
 */
export function seedOrder(size: number): number[] {
  if (size <= 1) return [1];
  if (size === 2) return [1, 2];

  const half = seedOrder(size / 2);
  const result: number[] = [];
  for (const x of half) {
    result.push(x, size + 1 - x);
  }
  return result;
}
