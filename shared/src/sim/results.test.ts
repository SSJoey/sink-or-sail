import { describe, expect, it } from "vitest";
import { createWorld } from "./match.ts";
import { matchPlaces, shipResults } from "./results.ts";
import type { World } from "./types.ts";

/** A world with ships' sinkings, lives, health and out flags set. */
function world(mode: "sinkCount" | "lastAfloat", ships: { sinkings?: number; livesLeft?: number; health?: number; out?: boolean }[]): World {
  const w = createWorld({ mode, ships: ships.length === 3 ? 3 : 2, lives: 2 });
  w.ships = w.ships.map((s, i) => ({ ...s, sinkings: ships[i]!.sinkings ?? 0, livesLeft: mode === "lastAfloat" ? ships[i]!.livesLeft ?? 2 : null, health: ships[i]!.health ?? 100, out: ships[i]!.out ?? false }));
  return w;
}

describe("places at the end of a match (Stage 3)", () => {
  it("Sink Count: most sinkings first; equal sinkings share a place", () => {
    expect(matchPlaces(world("sinkCount", [{ sinkings: 1 }, { sinkings: 3 }, { sinkings: 1 }]), [null, null, null])).toEqual([2, 1, 2]);
    expect(matchPlaces(world("sinkCount", [{ sinkings: 0 }, { sinkings: 0 }]), [null, null])).toEqual([1, 1]);
  });

  it("Last Afloat: the crew still in first, then crews in the order they went out (out later places higher)", () => {
    const w = world("lastAfloat", [{ livesLeft: 0, out: true }, { livesLeft: 1 }, { livesLeft: 0, out: true }]);
    expect(matchPlaces(w, [30, null, 95])).toEqual([3, 1, 2]);
  });

  it("Last Afloat at the time limit: crews still in by lives left, then health; equal is shared", () => {
    const w = world("lastAfloat", [{ livesLeft: 1, health: 80 }, { livesLeft: 2, health: 10 }, { livesLeft: 1, health: 80 }]);
    expect(matchPlaces(w, [null, null, null])).toEqual([2, 1, 2]);
    const out = world("lastAfloat", [{ livesLeft: 1, health: 50 }, { livesLeft: 0, out: true }]);
    expect(matchPlaces(out, [null, 200])).toEqual([1, 2]);
  });
});

describe("each ship's result", () => {
  it("gives place, sinkings, time afloat (rounded to the second) and, in Last Afloat, lives left and out", () => {
    const w = world("lastAfloat", [{ sinkings: 2, livesLeft: 1 }, { livesLeft: 0, out: true }]);
    expect(shipResults(w, [181.4, 90.6], [null, 120])).toEqual([
      { ship: 0, place: 1, sinkings: 2, afloatSeconds: 181, livesLeft: 1, out: false },
      { ship: 1, place: 2, sinkings: 0, afloatSeconds: 91, livesLeft: 0, out: true },
    ]);
    expect(shipResults(world("sinkCount", [{ sinkings: 1 }, {}]), [240, 237], [null, null])[0]).toEqual({ ship: 0, place: 1, sinkings: 1, afloatSeconds: 240, livesLeft: null, out: false });
  });
});
