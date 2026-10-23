import { TUNING } from "../tuning.ts";
import { SEA_CENTRE } from "./map.ts";
import type { Ship } from "./types.ts";
import { angleOf, distance, sub, type Vec } from "./vec.ts";

/** The "safe spot": the point whose nearest enemy is farthest away. */
export function chooseSpawn(points: readonly Vec[], enemies: readonly Vec[]): Vec {
  let best = points[0]!;
  let bestDist = -Infinity;
  for (const point of points) {
    const nearest = Math.min(...enemies.map((enemy) => distance(point, enemy)));
    if (nearest > bestDist) {
      best = point;
      bestDist = nearest;
    }
  }
  return best;
}

/** Brings a sunk ship back at `pos`: full health and energy, protected, facing the middle of the sea. */
export function respawnShip(ship: Ship, pos: Vec): Ship {
  const heading = angleOf(sub(SEA_CENTRE, pos));
  return {
    ...ship,
    pos,
    vel: { x: 0, y: 0 },
    heading,
    turret: heading,
    health: TUNING.ship.maxHealth,
    energy: TUNING.energy.max,
    energyLocked: false,
    boosting: false,
    shielding: false,
    fireCooldown: 0,
    protection: TUNING.respawn.protection,
    sunk: false,
    respawnIn: 0,
  };
}
