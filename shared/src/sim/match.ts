import { TUNING } from "../tuning.ts";
import { SEA_CENTRE, START_POINTS } from "./map.ts";
import type { Ship, World } from "./types.ts";
import { angleOf, sub } from "./vec.ts";

export function createWorld(): World {
  const ships: Ship[] = START_POINTS.map((pos, id) => {
    const heading = angleOf(sub(SEA_CENTRE, pos));
    return {
      id,
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
      protection: 0,
      sunk: false,
      respawnIn: 0,
      sinkings: 0,
      boostEnergy: 0,
      shieldEnergy: 0,
    };
  });
  return { time: 0, ships, shots: [], nextShotId: 0, contacts: [], over: false };
}

export function timeLeft(world: World): number {
  return Math.max(0, TUNING.match.duration - world.time);
}

/** Sink Count: most sinkings wins; equal sinkings is a draw (winner null). */
export function matchResult(world: World): { winner: number | null; sinkings: number[] } {
  const sinkings = world.ships.map((ship) => ship.sinkings);
  const best = Math.max(...sinkings);
  const leaders = world.ships.filter((ship) => ship.sinkings === best);
  return { winner: leaders.length === 1 ? leaders[0]!.id : null, sinkings };
}
