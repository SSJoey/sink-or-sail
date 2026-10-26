import { TUNING } from "../tuning.ts";
import { nextRandom, randomIndex, type Random } from "./random.ts";
import type { Hazard, Ship, SimEvent, World } from "./types.ts";
import { add, angleOf, distance, fromAngle, scale, sub, type Vec } from "./vec.ts";

const EPSILON = 1e-9;
const H = TUNING.hazards;
const M = TUNING.movingStorm;

/** The hazard timer has its own copy of the seed, so the map's packs are the same with hazards on or off. */
const HAZARD_SEED_MIX = 0x85ebca6b;
export const hazardSeed = (seed: number) => (seed ^ HAZARD_SEED_MIX) >>> 0;

/** Tries at a spot around the picked ship before waiting `retryAfter` and trying again. */
const PLACE_TRIES = 12;

/** A spot is inside a moving storm when it is within the storm's radius of its centre. */
export const inMovingStorm = (pos: Vec, storm: Hazard) => distance(pos, storm.pos) <= M.radius + EPSILON;

const outsideSea = (pos: Vec) => pos.x < 0 || pos.y < 0 || pos.x > TUNING.sea.width || pos.y > TUNING.sea.height;

/**
 * Where the next moving storm appears: `distanceFromShip` from a ship afloat (picked with the seed), in a seeded
 * direction, wholly inside the sea, with its edge `clearance` clear of every ship afloat; it heads for that ship.
 * Null when no ship is afloat or no try finds a clear spot.
 */
export function placeMovingStorm(ships: readonly Ship[], state: number): Random<{ pos: Vec; heading: number; ship: number } | null> {
  const afloat = ships.filter((s) => !s.sunk);
  if (afloat.length === 0) return { value: null, state };
  const pick = randomIndex(state, afloat.length);
  state = pick.state;
  const target = afloat[pick.value]!;
  const clear = M.radius + TUNING.ship.radius + H.clearance;
  for (let i = 0; i < PLACE_TRIES; i++) {
    const roll = nextRandom(state);
    state = roll.state;
    const pos = add(target.pos, scale(fromAngle(roll.value * Math.PI * 2), H.distanceFromShip));
    const inSea = pos.x >= M.radius && pos.y >= M.radius && pos.x <= TUNING.sea.width - M.radius && pos.y <= TUNING.sea.height - M.radius;
    if (!inSea || afloat.some((s) => distance(s.pos, pos) < clear)) continue;
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
 * One step of the dynamic hazards: signalled ones count down and start acting; active and fading ones move;
 * active ones stop acting at the end of their time or when their centre leaves the sea, then fade and go.
 * Then the timer runs (only while fewer than the most allowed are on the sea) and signals the next one.
 */
export function updateHazards(world: World, ships: readonly Ship[], dt: number): HazardUpdate {
  const events: SimEvent[] = [];
  const hazards: Hazard[] = [];
  for (const hazard of world.hazards) {
    let h = { ...hazard, timeLeft: hazard.timeLeft - dt };
    if (h.phase === "signalled") {
      if (h.timeLeft <= EPSILON) {
        h = { ...h, phase: "active", timeLeft: M.lifetime };
        events.push({ type: "hazardStarted", hazard: h.id, kind: h.kind });
      }
      hazards.push(h);
      continue;
    }
    h = { ...h, pos: add(h.pos, scale(fromAngle(h.heading), M.speed * dt)) };
    if (h.phase === "active") {
      const edge = outsideSea(h.pos);
      if (edge || h.timeLeft <= EPSILON) {
        events.push({ type: "hazardEnded", hazard: h.id, kind: h.kind, reason: edge ? "edge" : "time" });
        h = { ...h, phase: "fading", timeLeft: M.fadeTime };
      }
    } else if (h.timeLeft <= EPSILON) continue;
    hazards.push(h);
  }

  let { nextHazardId, nextHazardIn, hazardRng } = world;
  if (nextHazardIn !== null && hazards.length < H.maxActive) {
    nextHazardIn -= dt;
    if (nextHazardIn <= EPSILON) {
      const placed = placeMovingStorm(ships, hazardRng);
      hazardRng = placed.state;
      if (placed.value) {
        const storm: Hazard = { id: nextHazardId++, kind: "movingStorm", pos: placed.value.pos, heading: placed.value.heading, phase: "signalled", timeLeft: H.signalTime };
        hazards.push(storm);
        events.push({ type: "hazardSignalled", hazard: storm.id, kind: storm.kind, pos: storm.pos, heading: storm.heading });
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

/** A ship afloat whose centre is inside an active moving storm is carried along the storm's direction. */
export function pushByStorms(ship: Ship, hazards: readonly Hazard[], dt: number): Ship {
  let pos = ship.pos;
  for (const h of hazards) {
    if (h.kind === "movingStorm" && h.phase === "active" && inMovingStorm(ship.pos, h)) pos = add(pos, scale(fromAngle(h.heading), M.push * dt));
  }
  return pos === ship.pos ? ship : { ...ship, pos };
}

/** Ships afloat inside an active moving storm, as "ship:hazard" (for `stormEntered` and `stormLeft`). */
export function stormContacts(ships: readonly Ship[], hazards: readonly Hazard[]): string[] {
  const keys: string[] = [];
  for (const ship of ships) {
    if (ship.sunk) continue;
    for (const h of hazards) if (h.kind === "movingStorm" && h.phase === "active" && inMovingStorm(ship.pos, h)) keys.push(`${ship.id}:${h.id}`);
  }
  return keys;
}
