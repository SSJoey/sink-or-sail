import { TUNING } from "../tuning.ts";
import { DEFAULT_LAYOUT, LAYOUTS, type LayoutId, type ReefAmount } from "./layouts.ts";
import { PACK_CHANCES } from "./packs.ts";
import { hazardSeed, zoneCount } from "./hazards.ts";
import { seaCentre, seaFor, type Sea } from "./sea.ts";
import { seaReefs, seaSpots, spreadLayout } from "./seaLayout.ts";
import { DEFAULT_STORM_TIMES } from "./storm.ts";
import { placeWrecks } from "./wrecks.ts";
import { statsOf, type ShipType } from "./shipTypes.ts";
import type { GameMode, Ship, StormTimes, World } from "./types.ts";
import { angleOf, sub } from "./vec.ts";

export interface WorldOptions {
  /** Stage 1 packs; off by default, which plays exactly as Stage 0. */
  packs?: boolean;
  /** Seed for the simulation's random generator. */
  seed?: number;
  /** 2 ships (default, as in Stage 0) or more, each count with its own starts and pack spots. */
  ships?: number;
  /** Stage 5: the sea (default: the size for the number of ships; a test server can ask for a bigger one). */
  sea?: Sea;
  /** Stage 2: Sink Count (default, as before) or Last Afloat. */
  mode?: GameMode;
  /** Last Afloat: lives per ship (default `TUNING.lastAfloat.lives`). */
  lives?: number;
  /** Stage 2: the island layout (default One Island, today's map). */
  layout?: LayoutId;
  /** Stage 2 hazards; off by default, which plays exactly as Stage 1. */
  hazards?: boolean;
  /** With hazards on: None, Few or All (default) of the layout's reefs. */
  reefs?: ReefAmount;
  /** The closing storm's times (Last Afloat with hazards on); default `TUNING.closingStorm`. */
  storm?: StormTimes;
  /** With hazards on: match seconds to the first dynamic hazard (default `TUNING.hazards.firstAt`); null for none. */
  firstHazardAt?: number | null;
  /** Stage 3: ships crewed by bots only (none by default). */
  botShips?: readonly number[];
  /** Stage 5: each ship's type, by ship id (a Frigate where none is given). */
  types?: readonly ShipType[];
}

export function createWorld(options: WorldOptions = {}): World {
  const packsOn = options.packs ?? false;
  const seed = (options.seed ?? 1) >>> 0;
  const count = options.ships ?? 2;
  const layout = LAYOUTS[options.layout ?? DEFAULT_LAYOUT];
  // Stage 5: the sea for the number of ships, and the layout on it (today's sea: exactly the layout's own).
  const sea = options.sea ?? seaFor(count);
  const spread = spreadLayout(layout.id, sea);
  const spots = seaSpots(layout.id, sea, count);
  const zones = zoneCount(sea);
  const mode = options.mode ?? "sinkCount";
  const livesLeft = mode === "lastAfloat" ? (options.lives ?? TUNING.lastAfloat.lives) : null;
  const ships: Ship[] = spots.starts.map((pos, id) => {
    const heading = angleOf(sub(seaCentre(sea), pos));
    const type = options.types?.[id] ?? "frigate";
    return {
      id,
      type,
      pos,
      vel: { x: 0, y: 0 },
      heading,
      turret: heading,
      health: statsOf({ type }).maxHealth,
      energy: statsOf({ type }).energyMax,
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
      onReef: false,
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
    sea,
    respawns: spots.respawns,
    layout: layout.id,
    islands: spread.islands,
    hazardsOn: options.hazards ?? false,
    reefs: options.hazards ? seaReefs(layout.id, sea, options.reefs ?? "all") : [],
    wrecks: options.hazards ? placeWrecks(spread.wrecks, packsOn, seed, PACK_CHANCES) : [],
    wreckPacks: [],
    storm: mode === "lastAfloat" && options.hazards ? (options.storm ?? DEFAULT_STORM_TIMES) : null,
    hazards: [],
    nextHazardId: 0,
    nextHazardIn: options.hazards ? (options.firstHazardAt === undefined ? TUNING.hazards.firstAt : options.firstHazardAt) : null,
    hazardRng: hazardSeed(seed),
    hazardContacts: [],
    botShips: options.botShips ?? [],
    ghosts: [],
    haunting: mode === "lastAfloat" && options.hazards && options.firstHazardAt !== null
      ? { meters: Array(zones).fill(0), cooldowns: Array(zones).fill(0) }
      : null,
    packsOn,
    rng: seed,
    packs: [],
    packSpots: spots.packSpots,
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
