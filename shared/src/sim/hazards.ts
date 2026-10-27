import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, type Polygon } from "./geometry.ts";
import { nextRandom, randomIndex, weightedPick, type Random } from "./random.ts";
import type { Ghost, Hazard, HazardKind, Ship, SimEvent, World } from "./types.ts";
import { add, angleOf, distance, fromAngle, scale, sub, type Vec } from "./vec.ts";

const EPSILON = 1e-9;
const H = TUNING.hazards;
const M = TUNING.movingStorm;
const W = TUNING.whirlpool;
const K = TUNING.kraken;
const HT = TUNING.haunting;
/** How many haunting zones the sea is split into. */
export const ZONES = HT.zonesAcross * HT.zonesDown;
const KIND_CHANCES = Object.entries(H.chances) as [HazardKind, number][];

/**
 * How far a hazard reaches from its middle, how far from the picked ship it appears, how long it acts and fades,
 * and the circle kept clear of islands and wrecks where it appears (0 for none).
 */
const SIZES: Record<HazardKind, { radius: number; distance: number; lifetime: number; fadeTime: number; clearOfSolids: number }> = {
  movingStorm: { radius: M.radius, distance: H.distanceFromShip, lifetime: M.lifetime, fadeTime: M.fadeTime, clearOfSolids: 0 },
  whirlpool: { radius: W.reach, distance: W.distanceFromShip, lifetime: W.lifetime, fadeTime: W.fadeTime, clearOfSolids: W.eyeRadius },
  kraken: { radius: K.grabReach, distance: K.distanceFromShip, lifetime: K.lifetime, fadeTime: K.fadeTime, clearOfSolids: K.bodyRadius },
};

/** The hazard timer has its own copy of the seed, so the map's packs are the same with hazards on or off. */
const HAZARD_SEED_MIX = 0x85ebca6b;
export const hazardSeed = (seed: number) => (seed ^ HAZARD_SEED_MIX) >>> 0;

/** Tries at a spot around the picked ship before waiting `retryAfter` and trying again. */
const PLACE_TRIES = 12;

/** A spot is inside a moving storm when it is within the storm's radius of its centre. */
export const inMovingStorm = (pos: Vec, storm: Hazard) => distance(pos, storm.pos) <= M.radius + EPSILON;

const outsideSea = (pos: Vec) => pos.x < 0 || pos.y < 0 || pos.x > TUNING.sea.width || pos.y > TUNING.sea.height;

/** Whether a hazard of `kind` may appear at `pos`: its whole reach inside the sea and clear of every ship afloat, and its body clear of `solids`. */
function clearSpot(kind: HazardKind, pos: Vec, afloat: readonly Ship[], solids: readonly Polygon[]): boolean {
  const { radius, clearOfSolids } = SIZES[kind];
  const inSea = pos.x >= radius && pos.y >= radius && pos.x <= TUNING.sea.width - radius && pos.y <= TUNING.sea.height - radius;
  if (!inSea || afloat.some((s) => distance(s.pos, pos) < radius + TUNING.ship.radius + H.clearance)) return false;
  return clearOfSolids <= 0 || solids.every((solid) => circleOverlapsPolygon(pos, clearOfSolids, solid) === null);
}

/** The haunting zone a spot is in (row by row; the far edges belong to the last row and column). */
export function zoneOf(pos: Vec): number {
  const across = Math.min(HT.zonesAcross - 1, Math.max(0, Math.floor((pos.x / TUNING.sea.width) * HT.zonesAcross)));
  const down = Math.min(HT.zonesDown - 1, Math.max(0, Math.floor((pos.y / TUNING.sea.height) * HT.zonesDown)));
  return down * HT.zonesAcross + across;
}

export function zoneRect(zone: number): { x0: number; y0: number; x1: number; y1: number } {
  const w = TUNING.sea.width / HT.zonesAcross;
  const h = TUNING.sea.height / HT.zonesDown;
  const x0 = (zone % HT.zonesAcross) * w;
  const y0 = Math.floor(zone / HT.zonesAcross) * h;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

/** Tries at a spot inside a haunted zone (more than around a ship: a zone may hold a ship or an island). */
const ZONE_TRIES = 60;

/**
 * Where a haunted hazard of `kind` appears: a seeded spot inside `zone` that is clear (see clearSpot). It heads for
 * the nearest ship afloat (the moving storm drifts that way). Null when no try finds a clear spot.
 */
export function placeInZone(kind: HazardKind, zone: number, ships: readonly Ship[], state: number, solids: readonly Polygon[]): Random<{ pos: Vec; heading: number } | null> {
  const afloat = ships.filter((s) => !s.sunk);
  const r = zoneRect(zone);
  for (let i = 0; i < ZONE_TRIES; i++) {
    const rx = nextRandom(state);
    const ry = nextRandom(rx.state);
    state = ry.state;
    const pos = { x: r.x0 + rx.value * (r.x1 - r.x0), y: r.y0 + ry.value * (r.y1 - r.y0) };
    if (zoneOf(pos) !== zone || !clearSpot(kind, pos, afloat, solids)) continue;
    const nearest = afloat.reduce<Ship | null>((best, s) => (!best || distance(s.pos, pos) < distance(best.pos, pos) ? s : best), null);
    return { value: { pos, heading: nearest ? angleOf(sub(nearest.pos, pos)) : 0 }, state };
  }
  return { value: null, state };
}

/** A new hazard, signalled: a whirlpool draws its spin with the seed; a kraken starts at full health, holding nothing. */
function signalHazard(id: number, kind: HazardKind, pos: Vec, heading: number, state: number, events: SimEvent[]): Random<Hazard> {
  let spin = 0;
  if (kind === "whirlpool") {
    const roll = nextRandom(state);
    state = roll.state;
    spin = roll.value < 0.5 ? 1 : -1;
  }
  const hazard: Hazard = {
    id, kind, pos, heading, phase: "signalled", timeLeft: H.signalTime, spin,
    ...(kind === "kraken" && { health: K.health, holding: null, holdLeft: 0 }),
  };
  events.push({ type: "hazardSignalled", hazard: id, kind, pos, heading, ...(spin !== 0 && { spin }) });
  return { value: hazard, state };
}

/** Seconds to the next timer hazard: between the gaps, drawn with the seed. */
function nextGap(state: number): Random<number> {
  const gap = nextRandom(state);
  return { value: H.minGap + gap.value * (H.maxGap - H.minGap), state: gap.state };
}

/**
 * Where the next hazard of `kind` appears: its distance from a ship afloat (picked with the seed), in a seeded
 * direction, its whole reach inside the sea and `clearance` clear of every ship afloat; a whirlpool's eye and a
 * kraken's body are also clear of every island and wreck (`solids`). It heads for that ship (the moving storm drifts
 * that way).
 * Null when no ship is afloat or no try finds a clear spot.
 */
export function placeHazard(kind: HazardKind, ships: readonly Ship[], state: number, solids: readonly Polygon[]): Random<{ pos: Vec; heading: number; ship: number } | null> {
  const afloat = ships.filter((s) => !s.sunk);
  if (afloat.length === 0) return { value: null, state };
  const pick = randomIndex(state, afloat.length);
  state = pick.state;
  const target = afloat[pick.value]!;
  const away = SIZES[kind].distance;
  for (let i = 0; i < PLACE_TRIES; i++) {
    const roll = nextRandom(state);
    state = roll.state;
    const pos = add(target.pos, scale(fromAngle(roll.value * Math.PI * 2), away));
    if (!clearSpot(kind, pos, afloat, solids)) continue;
    return { value: { pos, heading: angleOf(sub(target.pos, pos)), ship: target.id }, state };
  }
  return { value: null, state };
}

export interface HazardUpdate {
  hazards: Hazard[];
  nextHazardId: number;
  nextHazardIn: number | null;
  hazardRng: number;
  events: SimEvent[];
  /** Kraken ticks on the ships they hold this step, for the step to apply (and log) as damage. */
  krakenDamage: { ship: number; hazard: number; damage: number }[];
  haunting: World["haunting"];
}

/** A kraken stops acting: it lets go of any ship it holds (for `released`), and fades. */
function dive(h: Hazard, reason: "time" | "grab" | "shot", released: "time" | "shot" | "sunk" | null, events: SimEvent[]): Hazard {
  if (released !== null && h.holding !== null && h.holding !== undefined) events.push({ type: "krakenReleased", ship: h.holding, hazard: h.id, reason: released });
  events.push({ type: "hazardEnded", hazard: h.id, kind: h.kind, reason });
  return { ...h, phase: "fading", timeLeft: K.fadeTime, holding: null, holdLeft: 0 };
}

/**
 * One active kraken's step. Holding a ship: the hold runs down, hurting the ship each tick; it lets go (and dives)
 * when the hold ends or the ship has sunk. Otherwise it swims toward the nearest ship afloat and not protected and
 * grabs it once in reach, or dives when its time is up.
 */
function krakenStep(h: Hazard, ships: readonly Ship[], dt: number, events: SimEvent[], damage: HazardUpdate["krakenDamage"]): Hazard {
  if (h.holding !== null && h.holding !== undefined) {
    const held = ships.find((s) => s.id === h.holding);
    if (!held || held.sunk) return dive(h, "grab", "sunk", events);
    const before = K.holdTime - (h.holdLeft ?? 0);
    const holdLeft = (h.holdLeft ?? 0) - dt;
    const ticks = Math.floor((K.holdTime - holdLeft) / K.tickSeconds + EPSILON) - Math.floor(before / K.tickSeconds + EPSILON);
    for (let i = 0; i < ticks; i++) damage.push({ ship: held.id, hazard: h.id, damage: TUNING.ship.maxHealth * K.damage });
    if (holdLeft <= EPSILON) return dive(h, "grab", "time", events);
    return { ...h, holdLeft };
  }
  if (h.timeLeft <= EPSILON) return dive(h, "time", null, events);
  let target: Ship | null = null;
  for (const ship of ships) {
    if (ship.sunk || ship.protection > 0) continue;
    if (!target || distance(ship.pos, h.pos) < distance(target.pos, h.pos)) target = ship;
  }
  if (!target) return h;
  const d = distance(target.pos, h.pos);
  const pos = d > EPSILON ? add(h.pos, scale(sub(target.pos, h.pos), Math.min(K.speed * dt, d) / d)) : h.pos;
  const heading = d > EPSILON ? angleOf(sub(target.pos, h.pos)) : h.heading;
  if (distance(target.pos, pos) > K.grabReach + EPSILON) return { ...h, pos, heading };
  events.push({ type: "krakenGrab", ship: target.id, hazard: h.id });
  return { ...h, pos, heading, holding: target.id, holdLeft: K.holdTime };
}

/** Whether `ship` is held by an active kraken. */
export const heldByKraken = (hazards: readonly Hazard[], ship: number) => hazards.some((h) => h.kind === "kraken" && h.phase === "active" && h.holding === ship);

/**
 * A shot or torpedo hits an active kraken: it loses health; at 0 it lets go of any ship it holds and dives.
 * Returns the hazards after the hit.
 */
export function hitKraken(hazards: readonly Hazard[], id: number, by: number, weapon: "shot" | "torpedo", damage: number, events: SimEvent[]): Hazard[] {
  return hazards.map((h) => {
    if (h.id !== id || h.kind !== "kraken" || h.phase !== "active") return h;
    events.push({ type: "krakenHit", hazard: id, by, weapon, damage });
    const health = (h.health ?? 0) - damage;
    return health > EPSILON ? { ...h, health } : dive({ ...h, health: 0 }, "shot", "shot", events);
  });
}

/**
 * One step of the dynamic hazards: signalled ones count down and start acting; active krakens hunt, grab and hold
 * (see krakenStep); active and fading moving storms move (whirlpools stay put); other active ones stop acting at the end of their time or when a storm's centre leaves the
 * sea, then fade and go. Then the timer runs (only while fewer than the most allowed are on the sea), picks the
 * next kind with the seed and signals it (`solids`: islands and standing wrecks, kept clear of a whirlpool's eye).
 */
export function updateHazards(world: World, ships: readonly Ship[], dt: number, solids: readonly Polygon[], ghosts: readonly Ghost[] = []): HazardUpdate {
  const events: SimEvent[] = [];
  const hazards: Hazard[] = [];
  const krakenDamage: HazardUpdate["krakenDamage"] = [];
  for (const hazard of world.hazards) {
    let h = { ...hazard, timeLeft: hazard.timeLeft - dt };
    if (h.phase === "signalled") {
      if (h.timeLeft <= EPSILON) {
        h = { ...h, phase: "active", timeLeft: SIZES[h.kind].lifetime };
        events.push({ type: "hazardStarted", hazard: h.id, kind: h.kind });
      }
      hazards.push(h);
      continue;
    }
    if (h.kind === "kraken" && h.phase === "active") {
      hazards.push(krakenStep(h, ships, dt, events, krakenDamage));
      continue;
    }
    if (h.kind === "movingStorm") h = { ...h, pos: add(h.pos, scale(fromAngle(h.heading), M.speed * dt)) };
    if (h.phase === "active") {
      const edge = outsideSea(h.pos);
      if (edge || h.timeLeft <= EPSILON) {
        events.push({ type: "hazardEnded", hazard: h.id, kind: h.kind, reason: edge ? "edge" : "time" });
        h = { ...h, phase: "fading", timeLeft: SIZES[h.kind].fadeTime };
      }
    } else if (h.timeLeft <= EPSILON) continue;
    hazards.push(h);
  }

  let { nextHazardId, nextHazardIn, hazardRng } = world;
  if (nextHazardIn !== null && hazards.length < H.maxActive) {
    nextHazardIn -= dt;
    if (nextHazardIn <= EPSILON) {
      const kind = weightedPick(hazardRng, KIND_CHANCES);
      const placed = placeHazard(kind.value, ships, kind.state, solids);
      hazardRng = placed.state;
      if (placed.value) {
        const signalled = signalHazard(nextHazardId++, kind.value, placed.value.pos, placed.value.heading, hazardRng, events);
        hazards.push(signalled.value);
        const gap = nextGap(signalled.state);
        hazardRng = gap.state;
        nextHazardIn = gap.value;
      } else {
        nextHazardIn = H.retryAfter;
      }
    }
  }

  // Stage 2 haunting: each zone's meter fills with the ghosts in it (or drains); a full one sets off a hazard there,
  // which may be a second one on the sea, and counts as the next hazard (the timer starts its wait again).
  let haunting = world.haunting;
  if (haunting) {
    const meters = [...haunting.meters];
    const cooldowns = [...haunting.cooldowns];
    const inZone: number[][] = meters.map(() => []);
    for (const ghost of ghosts) if (ghost.appearIn <= 0) inZone[zoneOf(ghost.pos)]!.push(ghost.ship);
    for (let zone = 0; zone < meters.length; zone++) {
      if (cooldowns[zone]! > 0) {
        cooldowns[zone] = Math.max(0, cooldowns[zone]! - dt);
        meters[zone] = 0;
        continue;
      }
      const count = inZone[zone]!.length;
      meters[zone] = count > 0 ? Math.min(1, meters[zone]! + (count * dt) / HT.fillTime) : Math.max(0, meters[zone]! - dt / HT.drainTime);
      if (meters[zone]! < 1 - EPSILON || hazards.length >= H.maxActive + 1) continue;
      const kind = weightedPick(hazardRng, KIND_CHANCES);
      const placed = placeInZone(kind.value, zone, ships, kind.state, solids);
      hazardRng = placed.state;
      if (!placed.value) continue;
      const signalled = signalHazard(nextHazardId++, kind.value, placed.value.pos, placed.value.heading, hazardRng, events);
      hazards.push(signalled.value);
      events.push({ type: "hauntingTriggered", zone, hazard: signalled.value.id, ghosts: inZone[zone]! });
      const gap = nextGap(signalled.state);
      hazardRng = gap.state;
      if (nextHazardIn !== null) nextHazardIn = gap.value;
      meters[zone] = 0;
      cooldowns[zone] = HT.zoneCap;
    }
    haunting = { meters, cooldowns };
  }
  return { hazards, nextHazardId, nextHazardIn, hazardRng, events, krakenDamage, haunting };
}

/** Whether a ship's centre is inside an active moving storm's cloud or whirlpool's pull (a kraken grabs instead). */
function caughtBy(pos: Vec, h: Hazard): boolean {
  if (h.phase !== "active") return false;
  if (h.kind === "movingStorm") return inMovingStorm(pos, h);
  if (h.kind === "whirlpool") return distance(pos, h.pos) <= W.reach + EPSILON;
  return false;
}

/** A whirlpool's inward pull at `d` from its middle: weak at the edge of its reach, stronger nearer the eye, strongest in it. */
export function whirlpoolPull(d: number): number {
  if (d > W.reach + EPSILON) return 0;
  if (d <= W.eyeRadius) return W.eyePull;
  return W.edgePull + ((W.innerPull - W.edgePull) * (W.reach - d)) / (W.reach - W.eyeRadius);
}

/**
 * Active hazards move a ship afloat whose centre is inside them: a moving storm carries it along its direction;
 * a whirlpool pulls it in (never past its middle) and swirls it round (clockwise on screen for spin 1).
 */
export function applyHazards(ship: Ship, hazards: readonly Hazard[], dt: number): Ship {
  let pos = ship.pos;
  for (const h of hazards) {
    if (!caughtBy(ship.pos, h)) continue;
    if (h.kind === "movingStorm") {
      pos = add(pos, scale(fromAngle(h.heading), M.push * dt));
      continue;
    }
    const d = distance(ship.pos, h.pos);
    if (d < EPSILON) continue;
    const inward = scale(sub(h.pos, ship.pos), 1 / d);
    const clockwise = { x: inward.y, y: -inward.x };
    pos = add(pos, add(scale(inward, Math.min(whirlpoolPull(d) * dt, d)), scale(clockwise, h.spin * W.swirl * dt)));
  }
  return pos === ship.pos ? ship : { ...ship, pos };
}

/** Ships afloat inside an active hazard, as "ship:hazard" (for the entered and left events). */
export function hazardContactsOf(ships: readonly Ship[], hazards: readonly Hazard[]): string[] {
  const keys: string[] = [];
  for (const ship of ships) {
    if (ship.sunk) continue;
    for (const h of hazards) if (caughtBy(ship.pos, h)) keys.push(`${ship.id}:${h.id}`);
  }
  return keys;
}
