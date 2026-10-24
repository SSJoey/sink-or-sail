import { TUNING } from "../tuning.ts";
import { segmentCircleHit, segmentPolygonHit, type Polygon } from "./geometry.ts";
import type { Mine, Ship } from "./types.ts";
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

export type ShotTrace = { kind: "none" } | { kind: "island" } | { kind: "ship"; target: number } | { kind: "mine"; mine: number };

/**
 * What a shot's path from→to runs into first: a ship afloat (not its own), the island, one of `mines`
 * (pass only armed mines; Stage 1), or nothing.
 */
export function traceShot(owner: number, from: Vec, to: Vec, ships: readonly Ship[], island: Polygon, mines: readonly Mine[] = []): ShotTrace {
  let nearest = segmentPolygonHit(from, to, island);
  let result: ShotTrace = nearest === null ? { kind: "none" } : { kind: "island" };
  for (const ship of ships) {
    if (ship.id === owner || ship.sunk) continue;
    const t = segmentCircleHit(from, to, ship.pos, TUNING.ship.radius);
    if (t !== null && (nearest === null || t < nearest)) {
      nearest = t;
      result = { kind: "ship", target: ship.id };
    }
  }
  for (const mine of mines) {
    const t = segmentCircleHit(from, to, mine.pos, TUNING.mine.radius);
    if (t !== null && (nearest === null || t < nearest)) {
      nearest = t;
      result = { kind: "mine", mine: mine.id };
    }
  }
  return result;
}
