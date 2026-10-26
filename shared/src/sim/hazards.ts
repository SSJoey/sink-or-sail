import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, type Polygon } from "./geometry.ts";
import { nextRandom, randomIndex, weightedPick, type Random } from "./random.ts";
import type { Hazard, HazardKind, Ship, SimEvent, World } from "./types.ts";
import { add, angleOf, distance, fromAngle, scale, sub, type Vec } from "./vec.ts";

const EPSILON = 1e-9;
const H = TUNING.hazards;
const M = TUNING.movingStorm;
const W = TUNING.whirlpool;
const KIND_CHANCES = Object.entries(H.chances) as [HazardKind, number][];

/** How far a hazard reaches from its middle, how far from the picked ship it appears, and how long it acts and fades. */
const SIZES: Record<HazardKind, { radius: number; distance: number; lifetime: number; fadeTime: number }> = {
  movingStorm: { radius: M.radius, distance: H.distanceFromShip, lifetime: M.lifetime, fadeTime: M.fadeTime },
  whirlpool: { radius: W.reach, distance: W.distanceFromShip, lifetime: W.lifetime, fadeTime: W.fadeTime },
};

/** The hazard timer has its own copy of the seed, so the map's packs are the same with hazards on or off. */
const HAZARD_SEED_MIX = 0x85ebca6b;
export const hazardSeed = (seed: number) => (seed ^ HAZARD_SEED_MIX) >>> 0;

/** Tries at a spot around the picked ship before waiting `retryAfter` and trying again. */
const PLACE_TRIES = 12;

/** A spot is inside a moving storm when it is within the storm's radius of its centre. */
export const inMovingStorm = (pos: Vec, storm: Hazard) => distance(pos, storm.pos) <= M.radius + EPSILON;

const outsideSea = (pos: Vec) => pos.x < 0 || pos.y < 0 || pos.x > TUNING.sea.width || pos.y > TUNING.sea.height;

/**
 * Where the next hazard of `kind` appears: its distance from a ship afloat (picked with the seed), in a seeded
 * direction, its whole reach inside the sea and `clearance` clear of every ship afloat; a whirlpool's eye is also
 * clear of every island and wreck (`solids`). It heads for that ship (the moving storm drifts that way).
 * Null when no ship is afloat or no try finds a clear spot.
 */
export function placeHazard(kind: HazardKind, ships: readonly Ship[], state: number, solids: readonly Polygon[]): Random<{ pos: Vec; heading: number; ship: number } | null> {
  const afloat = ships.filter((s) => !s.sunk);
  if (afloat.length === 0) return { value: null, state };
  const pick = randomIndex(state, afloat.length);
  state = pick.state;
  const target = afloat[pick.value]!;
  const { radius, distance: away } = SIZES[kind];
  const clear = radius + TUNING.ship.radius + H.clearance;
  for (let i = 0; i < PLACE_TRIES; i++) {
    const roll = nextRandom(state);
    state = roll.state;
    const pos = add(target.pos, scale(fromAngle(roll.value * Math.PI * 2), away));
    const inSea = pos.x >= radius && pos.y >= radius && pos.x <= TUNING.sea.width - radius && pos.y <= TUNING.sea.height - radius;
    if (!inSea || afloat.some((s) => distance(s.pos, pos) < clear)) continue;
    if (kind === "whirlpool" && solids.some((solid) => circleOverlapsPolygon(pos, W.eyeRadius, solid) !== null)) continue;
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
}

/**
 * One step of the dynamic hazards: signalled ones count down and start acting; active and fading moving storms
 * move (whirlpools stay put); active ones stop acting at the end of their time or when a storm's centre leaves the
 * sea, then fade and go. Then the timer runs (only while fewer than the most allowed are on the sea), picks the
 * next kind with the seed and signals it (`solids`: islands and standing wrecks, kept clear of a whirlpool's eye).
 */
export function updateHazards(world: World, ships: readonly Ship[], dt: number, solids: readonly Polygon[]): HazardUpdate {
  const events: SimEvent[] = [];
  const hazards: Hazard[] = [];
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
        let spin = 0;
        if (kind.value === "whirlpool") {
          const roll = nextRandom(hazardRng);
          hazardRng = roll.state;
          spin = roll.value < 0.5 ? 1 : -1;
        }
        const hazard: Hazard = { id: nextHazardId++, kind: kind.value, pos: placed.value.pos, heading: placed.value.heading, phase: "signalled", timeLeft: H.signalTime, spin };
        hazards.push(hazard);
        events.push({ type: "hazardSignalled", hazard: hazard.id, kind: hazard.kind, pos: hazard.pos, heading: hazard.heading, ...(spin !== 0 && { spin }) });
        const gap = nextRandom(hazardRng);
        hazardRng = gap.state;
        nextHazardIn = H.minGap + gap.value * (H.maxGap - H.minGap);
      } else {
        nextHazardIn = H.retryAfter;
      }
    }
  }
  return { hazards, nextHazardId, nextHazardIn, hazardRng, events };
}

/** Whether a ship's centre is inside an active hazard's reach (a moving storm's cloud, a whirlpool's pull). */
function caughtBy(pos: Vec, h: Hazard): boolean {
  if (h.phase !== "active") return false;
  return h.kind === "movingStorm" ? inMovingStorm(pos, h) : distance(pos, h.pos) <= W.reach + EPSILON;
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
