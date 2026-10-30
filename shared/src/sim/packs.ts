import { PACK_USER } from "../packRules.ts";
import { TUNING } from "../tuning.ts";
import { randomIndex, weightedPick } from "./random.ts";
import { statsOf } from "./shipTypes.ts";
import type { Pack, PackType, Ship, SimEvent, World, WreckPack } from "./types.ts";
import { distance, type Vec } from "./vec.ts";

/** Guards timer comparisons against float drift from adding dt many times. */
const EPSILON = 1e-9;

export const PACK_CHANCES = Object.entries(TUNING.packs.chances) as [PackType, number][];

/** A ship and a pack touch when their circles overlap. */
const touches = (ship: Ship, pack: Vec) => distance(ship.pos, pack) < statsOf(ship).radius + TUNING.packs.radius;

/** Spots (indices into the world's pack spots) with no pack, glowing or not, and no ship afloat on them. */
export function freeSpots(world: World): number[] {
  return world.packSpots.flatMap((spot, i) => {
    const used = world.packs.some((p) => p.spot === i);
    const shipOnIt = world.ships.some((s) => !s.sunk && touches(s, spot));
    return used || shipOnIt ? [] : [i];
  });
}

/** Signals a pack at a random free spot with a random type, or returns null if no spot is free. */
export function signalPack(world: World): { world: World; event: Extract<SimEvent, { type: "packSignalled" }> } | null {
  const free = freeSpots(world);
  if (free.length === 0) return null;
  const spotPick = randomIndex(world.rng, free.length);
  const typePick = weightedPick(spotPick.state, PACK_CHANCES);
  const pack: Pack = {
    id: world.nextPackId, spot: free[spotPick.value]!, type: typePick.value,
    signalLeft: TUNING.packs.signalTime, lifeLeft: TUNING.packs.lifetime,
  };
  return {
    world: { ...world, rng: typePick.state, packs: [...world.packs, pack], nextPackId: world.nextPackId + 1 },
    event: { type: "packSignalled", pack: pack.id, spot: pack.spot, packType: pack.type },
  };
}

/** The slot a pack goes in: the pilot's for a mine, the gunner's for a torpedo or EMP (health has none). */
const slotFor = (type: PackType) => (PACK_USER[type] === "pilot" ? "pilotPack" : "gunnerPack");

/**
 * The ship that takes a pack lying at `pos`: the lowest-id ship afloat touching it that can take it.
 * A slot pack needs its role's slot empty; a health pack needs no slot and is left alone by a ship at full health.
 */
function takerOf(ships: readonly Ship[], pos: Vec, type: PackType): number {
  return ships.findIndex((ship) => {
    if (ship.sunk || !touches(ship, pos)) return false;
    return type === "health" ? ship.health < statsOf(ship).maxHealth : ship[slotFor(type)] === null;
  });
}

/** The taker gets the pack: a slot pack goes in its slot; a health pack heals a fixed amount at once (never above its own full health). */
function givePack(ships: Ship[], index: number, pack: { id: number; type: PackType }, events: SimEvent[]): void {
  const ship = ships[index]!;
  events.push({ type: "packPickedUp", ship: ship.id, pack: pack.id, packType: pack.type });
  if (pack.type === "health") {
    const amount = Math.min(statsOf(ship).maxHealth - ship.health, TUNING.packs.healthRestore * TUNING.ship.maxHealth);
    ships[index] = { ...ship, health: ship.health + amount };
    events.push({ type: "healthRestored", ship: ship.id, amount });
  } else {
    ships[index] = { ...ship, [slotFor(pack.type)]: pack.type };
  }
}

/**
 * Ships afloat take packs they touch, lowest ship id first (see takerOf). A pickup from a full map
 * restarts the spawn clock.
 */
export function pickUpPacks(world: World): { world: World; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const ships = [...world.ships];
  const remaining: Pack[] = [];
  const wasFull = world.packs.length >= TUNING.packs.maxOnMap;

  for (const pack of world.packs) {
    const index = pack.signalLeft > EPSILON ? -1 : takerOf(ships, world.packSpots[pack.spot]!, pack.type);
    if (index < 0) remaining.push(pack);
    else givePack(ships, index, pack, events);
  }

  if (events.length === 0) return { world, events };
  const glowing = remaining.some((p) => p.signalLeft > EPSILON);
  const nextSignalIn = wasFull && world.nextSignalIn === null && !glowing ? TUNING.packs.spawnInterval : world.nextSignalIn;
  return { world: { ...world, ships, packs: remaining, nextSignalIn }, events };
}

/**
 * Packs that appeared before this step count down and disappear when nobody took them in time. Like a
 * pickup, one disappearing from a full map restarts the spawn clock.
 */
function expirePacks(world: World, dt: number, justSpawned: ReadonlySet<number>): { world: World; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const wasFull = world.packs.length >= TUNING.packs.maxOnMap;
  const packs = world.packs.flatMap((pack) => {
    if (pack.signalLeft > EPSILON || justSpawned.has(pack.id)) return [pack];
    const lifeLeft = pack.lifeLeft - dt;
    if (lifeLeft > EPSILON) return [{ ...pack, lifeLeft }];
    events.push({ type: "packExpired", pack: pack.id, spot: pack.spot, packType: pack.type });
    return [];
  });
  if (events.length === 0) return { world: { ...world, packs }, events };
  const glowing = packs.some((p) => p.signalLeft > EPSILON);
  const nextSignalIn = wasFull && world.nextSignalIn === null && !glowing ? TUNING.packs.spawnInterval : world.nextSignalIn;
  return { world: { ...world, packs, nextSignalIn }, events };
}

/**
 * The spawn clock: one pack at a time. When the clock runs out a free spot is signalled (retrying each
 * step if none is free); after its glow the pack appears, and the clock restarts unless the map is full.
 * Then packs nobody took disappear (see expirePacks).
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

  const justSpawned = new Set(events.flatMap((e) => (e.type === "packSpawned" ? [e.pack] : [])));
  const expired = expirePacks({ ...next, packs, nextSignalIn }, dt, justSpawned);
  return { world: expired.world, events: [...events, ...expired.events] };
}

/**
 * Stage 2: packs released from wrecks. Ones already lying there count down and disappear at 0 (like other
 * packs); then ships take the ones they touch, the same way as other packs. They play no part in the
 * spawn clock or the map's pack limit.
 */
export function updateWreckPacks(world: World, dt: number): { world: World; events: SimEvent[] } {
  if (world.wreckPacks.length === 0) return { world, events: [] };
  const events: SimEvent[] = [];
  const ships = [...world.ships];
  const wreckPacks: WreckPack[] = [];
  for (const pack of world.wreckPacks) {
    const lifeLeft = pack.lifeLeft - dt;
    if (lifeLeft <= EPSILON) {
      events.push({ type: "packExpired", pack: pack.id, spot: null, packType: pack.type });
      continue;
    }
    const index = takerOf(ships, pack.pos, pack.type);
    if (index < 0) wreckPacks.push({ ...pack, lifeLeft });
    else givePack(ships, index, pack, events);
  }
  return { world: { ...world, ships, wreckPacks }, events };
}
