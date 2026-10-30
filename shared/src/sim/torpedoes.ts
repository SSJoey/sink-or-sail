import { DEFAULT_SEA, type Sea } from "./sea.ts";
import { TUNING } from "../tuning.ts";
import { statsOf } from "./shipTypes.ts";
import type { Ship, Torpedo } from "./types.ts";
import { add, fromAngle, scale } from "./vec.ts";

/** A torpedo leaves from just ahead of its own bow, along the heading, at fixed speed (not adding the ship's). */
export function launchTorpedo(ship: Ship, id: number): Torpedo {
  const dir = fromAngle(ship.heading);
  return { id, owner: ship.id, pos: add(ship.pos, scale(dir, statsOf(ship).radius + 2)), vel: scale(dir, TUNING.torpedo.speed) };
}

/** Damage a torpedo deals: none during respawn protection (it's still used up), halved by a raised shield. */
export function torpedoDamage(target: Ship): { damage: number; shieldHalved: boolean } {
  if (target.protection > 0) return { damage: 0, shieldHalved: false };
  const full = TUNING.torpedo.damage * TUNING.ship.maxHealth;
  return target.shielding ? { damage: full * TUNING.torpedo.shieldFactor, shieldHalved: true } : { damage: full, shieldHalved: false };
}

export const outsideSea = (p: { x: number; y: number }, sea: Sea = DEFAULT_SEA) =>
  p.x < 0 || p.x > sea.width || p.y < 0 || p.y > sea.height;
