import { TUNING } from "../tuning.ts";
import { PACK_SPOTS } from "./map.ts";
import { randomIndex, weightedPick } from "./random.ts";
import type { Pack, PackType, SimEvent, World } from "./types.ts";
import { distance } from "./vec.ts";

/** Guards timer comparisons against float drift from adding dt many times. */
const EPSILON = 1e-9;

const PACK_CHANCES = Object.entries(TUNING.packs.chances) as [PackType, number][];

/** A ship and a pack touch when their circles overlap. */
const touches = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  distance(a, b) < TUNING.ship.radius + TUNING.packs.radius;

/** Spots (indices into PACK_SPOTS) with no pack, glowing or not, and no ship afloat on them. */
export function freeSpots(world: World): number[] {
  return PACK_SPOTS.flatMap((spot, i) => {
    const used = world.packs.some((p) => p.spot === i);
    const shipOnIt = world.ships.some((s) => !s.sunk && touches(s.pos, spot));
    return used || shipOnIt ? [] : [i];
  });
}

/** Signals a pack at a random free spot with a random type, or returns null if no spot is free. */
export function signalPack(world: World): { world: World; event: Extract<SimEvent, { type: "packSignalled" }> } | null {
  const free = freeSpots(world);
  if (free.length === 0) return null;
  const spotPick = randomIndex(world.rng, free.length);
  const typePick = weightedPick(spotPick.state, PACK_CHANCES);
  const pack: Pack = { id: world.nextPackId, spot: free[spotPick.value]!, type: typePick.value, signalLeft: TUNING.packs.signalTime };
  return {
    world: { ...world, rng: typePick.state, packs: [...world.packs, pack], nextPackId: world.nextPackId + 1 },
    event: { type: "packSignalled", pack: pack.id, spot: pack.spot, packType: pack.type },
  };
}

/**
 * Ships afloat take packs they touch, lowest ship id first. A slot pack needs an empty slot;
 * a health pack is used at once, skips the slot, and is left alone by a ship at full health.
 * A pickup from a full map restarts the spawn clock.
 */
export function pickUpPacks(world: World): { world: World; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const ships = [...world.ships];
  const remaining: Pack[] = [];
  const wasFull = world.packs.length >= TUNING.packs.maxOnMap;

  for (const pack of world.packs) {
    const index = pack.signalLeft > EPSILON ? -1 : ships.findIndex((ship) => {
      if (ship.sunk || !touches(ship.pos, PACK_SPOTS[pack.spot]!)) return false;
      return pack.type === "health" ? ship.health < TUNING.ship.maxHealth : ship.held === null;
    });
    if (index < 0) {
      remaining.push(pack);
      continue;
    }
    const ship = ships[index]!;
    events.push({ type: "packPickedUp", ship: ship.id, pack: pack.id, packType: pack.type });
    if (pack.type === "health") {
      const amount = Math.min(TUNING.ship.maxHealth - ship.health, TUNING.packs.healthRestore * TUNING.ship.maxHealth);
      ships[index] = { ...ship, health: ship.health + amount };
      events.push({ type: "healthRestored", ship: ship.id, amount });
    } else {
      ships[index] = { ...ship, held: pack.type };
    }
  }

  if (events.length === 0) return { world, events };
  const glowing = remaining.some((p) => p.signalLeft > EPSILON);
  const nextSignalIn = wasFull && world.nextSignalIn === null && !glowing ? TUNING.packs.spawnInterval : world.nextSignalIn;
  return { world: { ...world, ships, packs: remaining, nextSignalIn }, events };
}

/**
 * The spawn clock: one pack at a time. When the clock runs out a free spot is signalled (retrying each
 * step if none is free); after its glow the pack appears, and the clock restarts unless the map is full.
 */
export function updatePacks(world: World, dt: number): { world: World; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let next = world;

  let nextSignalIn = next.nextSignalIn === null ? null : Math.max(0, next.nextSignalIn - dt);
  if (nextSignalIn !== null && nextSignalIn <= EPSILON && next.packs.length < TUNING.packs.maxOnMap) {
    const signalled = signalPack(next);
    if (signalled) {
      next = signalled.world;
      events.push(signalled.event);
      nextSignalIn = null;
    }
  }

  const packs = next.packs.map((pack) => {
    if (pack.signalLeft <= 0 || events.some((e) => e.type === "packSignalled" && e.pack === pack.id)) return pack;
    const signalLeft = pack.signalLeft - dt;
    if (signalLeft > EPSILON) return { ...pack, signalLeft };
    events.push({ type: "packSpawned", pack: pack.id, spot: pack.spot, packType: pack.type });
    return { ...pack, signalLeft: 0 };
  });
  if (events.some((e) => e.type === "packSpawned")) {
    nextSignalIn = packs.length < TUNING.packs.maxOnMap ? TUNING.packs.spawnInterval : null;
  }

  return { world: { ...next, packs, nextSignalIn }, events };
}
