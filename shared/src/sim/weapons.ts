import { TUNING } from "../tuning.ts";
import type { GunnerInput, Ship, Shot, SimEvent } from "./types.ts";
import { add, angleOf, fromAngle, length, scale, type Vec } from "./vec.ts";

/** Guards the cooldown check against float drift (0.4 − 8 × 0.05 is not exactly 0). */
const EPSILON = 1e-9;

/** Turret points exactly along the aim, in sea directions. A zero or non-finite aim keeps the last one. */
export function aimTurret(ship: Ship, aim: Vec): Ship {
  if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y) || length(aim) === 0) return ship;
  return { ...ship, turret: angleOf(aim) };
}

/**
 * Counts the cooldown down and fires while Fire is held. Holding Shield blocks firing (shield wins).
 * Firing ends respawn protection early.
 */
export function fireGun(
  ship: Ship,
  gunner: GunnerInput,
  dt: number,
  nextShotId: number,
): { ship: Ship; shot: Shot | null; events: SimEvent[] } {
  const fireCooldown = Math.max(0, ship.fireCooldown - dt);
  if (ship.sunk || !gunner.fire || gunner.shield || fireCooldown > EPSILON) {
    return { ship: { ...ship, fireCooldown }, shot: null, events: [] };
  }

  const shot: Shot = {
    id: nextShotId,
    owner: ship.id,
    pos: ship.pos,
    vel: scale(fromAngle(ship.turret), TUNING.gun.shotSpeed),
    travelled: 0,
  };
  const events: SimEvent[] = [{ type: "shotFired", ship: ship.id, shot: shot.id }];
  if (ship.protection > 0) events.push({ type: "protectionEnded", ship: ship.id });

  return { ship: { ...ship, fireCooldown: TUNING.gun.fireInterval, protection: 0 }, shot, events };
}

/** Moves a shot for one step, stopping at its range. Returns the path swept, for hit tests. */
export function moveShot(shot: Shot, dt: number): { shot: Shot; from: Vec; to: Vec; expired: boolean } {
  const remaining = TUNING.gun.shotRange - shot.travelled;
  const step = Math.min(TUNING.gun.shotSpeed * dt, remaining);
  const to = add(shot.pos, scale(shot.vel, step / TUNING.gun.shotSpeed));
  return {
    shot: { ...shot, pos: to, travelled: shot.travelled + step },
    from: shot.pos,
    to,
    expired: step >= remaining,
  };
}
