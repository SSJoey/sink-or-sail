import { TUNING } from "../tuning.ts";
import { PACK_SPOTS, PACK_SPOTS_3, SEA_CENTRE, START_POINTS, START_POINTS_3 } from "./map.ts";
import type { Ship, World } from "./types.ts";
import { angleOf, sub } from "./vec.ts";

export interface WorldOptions {
  /** Stage 1 packs; off by default, which plays exactly as Stage 0. */
  packs?: boolean;
  /** Seed for the simulation's random generator. */
  seed?: number;
  /** 2 ships (default, as in Stage 0) or 3, each with its own starts and pack spots. */
  ships?: 2 | 3;
}

export function createWorld(options: WorldOptions = {}): World {
  const packsOn = options.packs ?? false;
  const three = options.ships === 3;
  const ships: Ship[] = (three ? START_POINTS_3 : START_POINTS).map((pos, id) => {
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
      pilotPack: null,
      gunnerPack: null,
      disabled: 0,
    };
  });
  return {
    time: 0,
    ships,
    shots: [],
    nextShotId: 0,
    contacts: [],
    over: false,
    packsOn,
    rng: (options.seed ?? 1) >>> 0,
    packs: [],
    packSpots: three ? PACK_SPOTS_3 : PACK_SPOTS,
    nextPackId: 0,
    nextSignalIn: packsOn ? TUNING.packs.spawnInterval : null,
    mines: [],
    nextMineId: 0,
    torpedoes: [],
    nextTorpedoId: 0,
  };
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
