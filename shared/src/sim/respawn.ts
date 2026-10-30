import { TUNING } from "../tuning.ts";
import { DEFAULT_SEA, seaCentre, type Sea } from "./sea.ts";
import { statsOf } from "./shipTypes.ts";
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

/** Brings a sunk ship back at `pos`: its type's full health and energy, protected, facing the middle of the sea. */
export function respawnShip(ship: Ship, pos: Vec, sea: Sea = DEFAULT_SEA): Ship {
  const heading = angleOf(sub(seaCentre(sea), pos));
  return {
    ...ship,
    pos,
    vel: { x: 0, y: 0 },
    heading,
    turret: heading,
    health: statsOf(ship).maxHealth,
    energy: statsOf(ship).energyMax,
    energyLocked: false,
    boosting: false,
    shielding: false,
    fireCooldown: 0,
    protection: TUNING.respawn.protection,
    sunk: false,
    respawnIn: 0,
    disabled: 0,
  };
}
