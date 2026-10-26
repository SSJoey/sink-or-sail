import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, type Polygon } from "./geometry.ts";
import type { PilotInput, Ship } from "./types.ts";
import { add, angleOf, clampLength, distance, dot, fromAngle, length, normalise, scale, sub, turnToward, type Vec } from "./vec.ts";

/** Ships closer than 2 × radius + this still count as touching, so a resting contact doesn't flicker. */
const CONTACT_SLOP = 1;

const finite = (v: Vec): Vec => (Number.isFinite(v.x) && Number.isFinite(v.y) ? v : { x: 0, y: 0 });

/**
 * Point-to-steer: the bow turns toward the stick at the turn rate, and the stick's length sets speed.
 * Boost drives the ship ahead at boosted top speed whatever the stick's length.
 * Velocity eases toward the heading through `grip`, which is what makes the ship drift.
 * `speedFactor` scales the top speed (a reef slows a ship to half).
 */
export function steerShip(ship: Ship, pilot: PilotInput, boosting: boolean, dt: number, speedFactor = 1): Ship {
  const { maxSpeed, turnRate, grip } = TUNING.ship;
  const stick = clampLength(finite(pilot.steer), 1);
  const throttle = length(stick);

  const heading = throttle > 0 ? turnToward(ship.heading, angleOf(stick), turnRate * dt) : ship.heading;
  const speed = (boosting ? maxSpeed * TUNING.boost.speedMultiplier : maxSpeed * throttle) * speedFactor;
  const wanted = scale(fromAngle(heading), speed);
  const catchUp = 1 - Math.exp(-grip * dt);
  const vel = add(ship.vel, scale(sub(wanted, ship.vel), catchUp));

  return { ...ship, heading, vel, pos: add(ship.pos, scale(vel, dt)) };
}

/** Stops a ship at the sea's edge; motion along the edge is kept. */
export function keepInSea(ship: Ship): Ship {
  const r = TUNING.ship.radius;
  const { width, height } = TUNING.sea;
  let { x, y } = ship.pos;
  let { x: vx, y: vy } = ship.vel;
  if (x < r) { x = r; vx = Math.max(0, vx); }
  if (x > width - r) { x = width - r; vx = Math.min(0, vx); }
  if (y < r) { y = r; vy = Math.max(0, vy); }
  if (y > height - r) { y = height - r; vy = Math.min(0, vy); }
  if (x === ship.pos.x && y === ship.pos.y && vx === ship.vel.x && vy === ship.vel.y) return ship;
  return { ...ship, pos: { x, y }, vel: { x: vx, y: vy } };
}

/** Pushes a ship out of the islands and removes the part of its motion heading into them, so it slides. */
export function pushOutOfIslands(ship: Ship, islands: readonly Polygon[]): Ship {
  let { pos, vel } = ship;
  // A few passes, because leaving one edge near a concave corner (or one rock next to another) can touch another.
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (const island of islands) {
      const push = circleOverlapsPolygon(pos, TUNING.ship.radius, island);
      if (!push) continue;
      pushed = true;
      pos = add(pos, scale(push.normal, push.depth));
      const into = dot(vel, push.normal);
      if (into < 0) vel = sub(vel, scale(push.normal, into));
    }
    if (!pushed) break;
  }
  return pos === ship.pos ? ship : { ...ship, pos, vel };
}

export interface Separation {
  a: Ship;
  b: Ship;
  touching: boolean;
  /** How fast the ships were moving toward each other along the line between them (0 if apart or separating). */
  closingSpeed: number;
}

/** Pushes two overlapping ships apart equally and takes out the speed they were closing at. */
export function separateShips(a: Ship, b: Ship): Separation {
  const minDist = 2 * TUNING.ship.radius;
  const dist = distance(a.pos, b.pos);
  if (dist >= minDist + CONTACT_SLOP) return { a, b, touching: false, closingSpeed: 0 };

  const normal = dist === 0 ? { x: 1, y: 0 } : normalise(sub(b.pos, a.pos));
  const closingSpeed = Math.max(0, dot(sub(a.vel, b.vel), normal));
  const overlap = Math.max(0, minDist - dist);

  let nextA = a;
  let nextB = b;
  if (overlap > 0 || closingSpeed > 0) {
    nextA = { ...a, pos: sub(a.pos, scale(normal, overlap / 2)), vel: sub(a.vel, scale(normal, closingSpeed / 2)) };
    nextB = { ...b, pos: add(b.pos, scale(normal, overlap / 2)), vel: add(b.vel, scale(normal, closingSpeed / 2)) };
  }
  return { a: nextA, b: nextB, touching: true, closingSpeed };
}
