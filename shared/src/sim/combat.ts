import { TUNING } from "../tuning.ts";
import { segmentCircleHit, segmentPolygonHit, type Polygon } from "./geometry.ts";
import { statsOf } from "./shipTypes.ts";
import type { Mine, Ship, Wreck } from "./types.ts";
import type { Vec } from "./vec.ts";

/** Damage each ship takes from a bump, scaled by closing speed. */
export function bumpDamage(closingSpeed: number): number {
  const { minSpeed, fullDamageSpeed, maxDamage } = TUNING.bump;
  if (closingSpeed <= minSpeed) return 0;
  return maxDamage * Math.min(1, (closingSpeed - minSpeed) / (fullDamageSpeed - minSpeed));
}

/** Shield and respawn protection both block all damage. */
export function canBeDamaged(ship: Ship): boolean {
  return !ship.sunk && !ship.shielding && ship.protection <= 0;
}

/** Applies damage; at zero health the ship sinks and its respawn countdown starts. */
export function damageShip(ship: Ship, amount: number): { ship: Ship; sank: boolean } {
  const health = Math.max(0, ship.health - amount);
  if (health > 0) return { ship: { ...ship, health }, sank: false };
  return {
    ship: {
      ...ship,
      health: 0,
      sunk: true,
      respawnIn: TUNING.respawn.delay,
      vel: { x: 0, y: 0 },
      boosting: false,
      shielding: false,
    },
    sank: true,
  };
}

export type ShotTrace = { kind: "none" } | { kind: "island" } | { kind: "ship"; target: number; at: number } | { kind: "mine"; mine: number } | { kind: "wreck"; wreck: number } | { kind: "kraken"; hazard: number };

/**
 * What a shot's path from→to runs into first: a ship afloat (not its own), an island, one of `mines`
 * (pass only armed mines; Stage 1), a wreck or a kraken's body (Stage 2; pass only active krakens), or nothing.
 * A ship hit also says where along the path it was struck (`at`, 0–1).
 */
export function traceShot(
  owner: number, from: Vec, to: Vec, ships: readonly Ship[], islands: readonly Polygon[], mines: readonly Mine[] = [], wrecks: readonly Wreck[] = [],
  krakens: readonly { id: number; pos: Vec }[] = [],
): ShotTrace {
  let nearest: number | null = null;
  for (const island of islands) {
    const t = segmentPolygonHit(from, to, island);
    if (t !== null && (nearest === null || t < nearest)) nearest = t;
  }
  let result: ShotTrace = nearest === null ? { kind: "none" } : { kind: "island" };
  for (const ship of ships) {
    if (ship.id === owner || ship.sunk) continue;
    const t = segmentCircleHit(from, to, ship.pos, statsOf(ship).radius);
    if (t !== null && (nearest === null || t < nearest)) {
      nearest = t;
      result = { kind: "ship", target: ship.id, at: t };
    }
  }
  for (const mine of mines) {
    const t = segmentCircleHit(from, to, mine.pos, TUNING.mine.radius);
    if (t !== null && (nearest === null || t < nearest)) {
      nearest = t;
      result = { kind: "mine", mine: mine.id };
    }
  }
  for (const wreck of wrecks) {
    const t = segmentPolygonHit(from, to, wreck.hull);
    if (t !== null && (nearest === null || t < nearest)) {
      nearest = t;
      result = { kind: "wreck", wreck: wreck.id };
    }
  }
  for (const kraken of krakens) {
    const t = segmentCircleHit(from, to, kraken.pos, TUNING.kraken.bodyRadius);
    if (t !== null && (nearest === null || t < nearest)) {
      nearest = t;
      result = { kind: "kraken", hazard: kraken.id };
    }
  }
  return result;
}
