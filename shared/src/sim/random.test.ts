import { describe, expect, it } from "vitest";
import { nextRandom, randomIndex, weightedPick } from "./random.ts";

function sequence(seed: number, n: number): number[] {
  const out: number[] = [];
  let state = seed;
  for (let i = 0; i < n; i++) {
    const r = nextRandom(state);
    out.push(r.value);
    state = r.state;
  }
  return out;
}

describe("nextRandom (mulberry32)", () => {
  it("gives the same sequence for the same seed", () => {
    expect(sequence(12345, 10)).toEqual(sequence(12345, 10));
  });

  it("gives a different sequence for a different seed", () => {
    expect(sequence(12345, 10)).not.toEqual(sequence(54321, 10));
  });

  it("returns numbers in [0, 1) and a whole-number state", () => {
    let state = 1;
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(state);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      expect(Number.isInteger(r.state)).toBe(true);
      state = r.state;
    }
  });

  it("is spread evenly enough for picking spots and pack types", () => {
    const buckets = [0, 0, 0, 0];
    for (const v of sequence(7, 4000)) buckets[Math.floor(v * 4)]!++;
    for (const count of buckets) expect(count).toBeGreaterThan(850);
  });
});

describe("randomIndex", () => {
  it("picks 0..n-1 and advances the state", () => {
    const r = randomIndex(99, 6);
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.value).toBeLessThan(6);
    expect(Number.isInteger(r.value)).toBe(true);
    expect(r.state).not.toBe(99);
  });
});

describe("weightedPick", () => {
  it("only picks items with weight, in proportion", () => {
    const counts = { a: 0, b: 0, c: 0 };
    let state = 3;
    for (let i = 0; i < 3000; i++) {
      const r = weightedPick(state, [["a", 1], ["b", 2], ["c", 0]] as const);
      counts[r.value]++;
      state = r.state;
    }
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(1.7);
    expect(counts.b / counts.a).toBeLessThan(2.3);
  });
});
