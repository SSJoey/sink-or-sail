import { TUNING } from "../tuning.ts";
import { PACK_SPOTS, PACK_SPOTS_3, SEA_CENTRE, START_POINTS, START_POINTS_3 } from "./map.ts";
import type { GameMode, Ship, World } from "./types.ts";
import { angleOf, sub } from "./vec.ts";

export interface WorldOptions {
  /** Stage 1 packs; off by default, which plays exactly as Stage 0. */
  packs?: boolean;
  /** Seed for the simulation's random generator. */
  seed?: number;
  /** 2 ships (default, as in Stage 0) or 3, each with its own starts and pack spots. */
  ships?: 2 | 3;
  /** Stage 2: Sink Count (default, as before) or Last Afloat. */
  mode?: GameMode;
  /** Last Afloat: lives per ship (default `TUNING.lastAfloat.lives`). */
  lives?: number;
}

export function createWorld(options: WorldOptions = {}): World {
  const packsOn = options.packs ?? false;
  const three = options.ships === 3;
  const mode = options.mode ?? "sinkCount";
  const livesLeft = mode === "lastAfloat" ? (options.lives ?? TUNING.lastAfloat.lives) : null;
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
      livesLeft,
      out: false,
    };
  });
  return {
    time: 0,
    ships,
    shots: [],
    nextShotId: 0,
    contacts: [],
    over: false,
    mode,
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

/** Match length: 4 minutes for Sink Count, the hard time limit for Last Afloat. */
export function matchDuration(world: World): number {
  return world.mode === "lastAfloat" ? TUNING.lastAfloat.duration : TUNING.match.duration;
}

export function timeLeft(world: World): number {
  return Math.max(0, matchDuration(world) - world.time);
}

/**
 * Sink Count: most sinkings wins; equal sinkings is a draw (winner null).
 * Last Afloat: of the ships still in the match, the only one wins; with more (at the time limit), most lives
 * left, then most health; otherwise (or with none left) a draw.
 */
export function matchResult(world: World): { winner: number | null; sinkings: number[] } {
  const sinkings = world.ships.map((ship) => ship.sinkings);
  if (world.mode === "lastAfloat") return { winner: lastAfloatWinner(world.ships), sinkings };
  const best = Math.max(...sinkings);
  const leaders = world.ships.filter((ship) => ship.sinkings === best);
  return { winner: leaders.length === 1 ? leaders[0]!.id : null, sinkings };
}

function lastAfloatWinner(ships: readonly Ship[]): number | null {
  let leaders = ships.filter((ship) => !ship.out);
  for (const score of [(s: Ship) => s.livesLeft ?? 0, (s: Ship) => s.health]) {
    const best = Math.max(...leaders.map(score));
    leaders = leaders.filter((ship) => score(ship) === best);
  }
  return leaders.length === 1 ? leaders[0]!.id : null;
}
