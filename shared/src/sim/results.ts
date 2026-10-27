import type { Ship, World } from "./types.ts";

/** One ship's line in the results at the end of a match (Stage 3). */
export interface ShipResult {
  ship: number;
  /** 1 for first; equal results share a place. */
  place: number;
  sinkings: number;
  /** Time on the water, not counting respawn waits (in Last Afloat, until the crew was out), whole seconds. */
  afloatSeconds: number;
  /** Last Afloat only: lives left and whether the crew was out; null / false in Sink Count. */
  livesLeft: number | null;
  out: boolean;
}

/** Compares two ships for the results: positive when `a` placed higher. */
function better(world: World, outAt: readonly (number | null)[], a: Ship, b: Ship): number {
  if (world.mode !== "lastAfloat") return a.sinkings - b.sinkings;
  // Crews still in beat crews that are out; among those still in, lives left then health; among those out, later out.
  if (a.out !== b.out) return a.out ? -1 : 1;
  if (a.out) return (outAt[a.id] ?? 0) - (outAt[b.id] ?? 0);
  return (a.livesLeft ?? 0) - (b.livesLeft ?? 0) || a.health - b.health;
}

/**
 * Each ship's place: Sink Count by sinkings (most first); Last Afloat the crews still in (by lives left, then health)
 * then the crews out (out later places higher). Equal results share a place. `outAt[ship]` is when that crew went out.
 */
export function matchPlaces(world: World, outAt: readonly (number | null)[]): number[] {
  return world.ships.map((ship) => 1 + world.ships.filter((other) => better(world, outAt, other, ship) > 0).length);
}

/** The results table: each ship's place, sinkings, time afloat and (Last Afloat) lives left. */
export function shipResults(world: World, afloat: readonly number[], outAt: readonly (number | null)[]): ShipResult[] {
  const places = matchPlaces(world, outAt);
  return world.ships.map((ship, i) => ({
    ship: ship.id,
    place: places[i]!,
    sinkings: ship.sinkings,
    afloatSeconds: Math.round(afloat[i] ?? 0),
    livesLeft: ship.livesLeft,
    out: ship.out,
  }));
}
