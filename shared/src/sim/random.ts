// Seeded randomness for the simulation (mulberry32). Pure: each call takes the generator's state
// and returns a value plus the next state, which the world carries, so the same seed replays the same match.

export interface Random<T> {
  value: T;
  state: number;
}

/** A number in [0, 1). */
export function nextRandom(state: number): Random<number> {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** A whole number from 0 to n - 1. */
export function randomIndex(state: number, n: number): Random<number> {
  const r = nextRandom(state);
  return { value: Math.floor(r.value * n), state: r.state };
}

/** One of the items, with chances in proportion to their weights. */
export function weightedPick<T>(state: number, items: readonly (readonly [T, number])[]): Random<T> {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  const r = nextRandom(state);
  let roll = r.value * total;
  for (const [item, weight] of items) {
    if (roll < weight) return { value: item, state: r.state };
    roll -= weight;
  }
  return { value: items.filter(([, w]) => w > 0).at(-1)![0], state: r.state };
}
