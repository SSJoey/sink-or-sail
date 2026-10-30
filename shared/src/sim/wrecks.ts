import { TUNING } from "../tuning.ts";
import { bumpDamage, canBeDamaged } from "./combat.ts";
import { circleOverlapsPolygon, type Polygon } from "./geometry.ts";
import { nextRandom, weightedPick } from "./random.ts";
import { statsOf } from "./shipTypes.ts";
import type { PackType, Ship, Wreck, WreckWeapon } from "./types.ts";
import { dot, type Vec } from "./vec.ts";

/** Where a layout puts a wreck: its centre, and the way its bow points (radians). */
export interface WreckSpot {
  pos: Vec;
  angle: number;
}

/** A wreck's hull: a pointed bow and a square stern, `TUNING.wreck.length` long, along `angle`. */
export function wreckHull(spot: WreckSpot): Polygon {
  const half = TUNING.wreck.length / 2;
  const side = TUNING.wreck.width / 2;
  const shoulder = half - side - 2;
  const corners: [number, number][] = [[half, 0], [shoulder, side], [-half, side], [-half, -side], [shoulder, -side]];
  const cos = Math.cos(spot.angle);
  const sin = Math.sin(spot.angle);
  return corners.map(([u, v]) => ({ x: spot.pos.x + u * cos - v * sin, y: spot.pos.y + u * sin + v * cos }));
}

/** Contact key for a ship touching a wreck (kept with the ship pairs in `world.contacts`). */
export const wreckContactKey = (ship: number, wreck: number) => `${ship}:w${wreck}`;

/** Wreck packs come from their own copy of the seed, so the map's packs are the same with hazards on or off. */
const WRECK_SEED_MIX = 0x9e3779b9;

/**
 * The match's wrecks at full health. With packs on, each holds a pack with `TUNING.wreck.packChance`,
 * its type picked with the packs' chances; the same seed gives the same wreck packs.
 */
export function placeWrecks(spots: readonly WreckSpot[], packsOn: boolean, seed: number, chances: readonly (readonly [PackType, number])[]): Wreck[] {
  let state = (seed ^ WRECK_SEED_MIX) >>> 0;
  return spots.map((spot, id) => {
    let pack: PackType | null = null;
    if (packsOn) {
      const roll = nextRandom(state);
      state = roll.state;
      if (roll.value < TUNING.wreck.packChance) {
        const type = weightedPick(state, chances);
        state = type.state;
        pack = type.value;
      }
    }
    return { id, pos: spot.pos, hull: wreckHull(spot), health: TUNING.wreck.health, pack };
  });
}

/** A ship touching a wreck (with the same slop as ship-to-ship contact). */
export function touchingWreck(ship: Ship, wreck: Wreck) {
  return circleOverlapsPolygon(ship.pos, statsOf(ship).radius + 1, wreck.hull);
}

/**
 * A ship ramming a wreck: a normal bump for the ship's speed into the hull (none while shielded or
 * protected), and the ram factor times that for the wreck.
 */
export function ramDamage(ship: Ship, normal: Vec): { ship: number; wreck: number } {
  const closingSpeed = Math.max(0, -dot(ship.vel, normal));
  const damage = bumpDamage(closingSpeed);
  return { ship: canBeDamaged(ship) ? damage : 0, wreck: damage * TUNING.wreck.ramFactor };
}

/** Damage each weapon does to a wreck: its usual damage to a ship (a shot: a Frigate's; a shot carries its own gun's). */
export function wreckDamage(weapon: Exclude<WreckWeapon, "bump">): number {
  const full = TUNING.ship.maxHealth;
  if (weapon === "shot") return TUNING.gun.shotDamage;
  return (weapon === "torpedo" ? TUNING.torpedo.damage : TUNING.mine.damage) * full;
}
