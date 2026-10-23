import { TUNING, add, fromAngle, scale, type Vec } from "@sink-or-sail/shared";

/** Hull outline with the bow pointing along +x, inside the ship's collision circle. */
const HULL: readonly Vec[] = [
  { x: 28, y: 0 },
  { x: 10, y: 12 },
  { x: -22, y: 11 },
  { x: -26, y: 6 },
  { x: -26, y: -6 },
  { x: -22, y: -11 },
  { x: 10, y: -12 },
];

const TURRET_LENGTH = 18;
/** Half the width of the aiming cone: 10° in total. */
export const AIM_CONE_HALF_ANGLE = (5 * Math.PI) / 180;

const rotate = (p: Vec, angle: number): Vec => ({
  x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
  y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
});

/** Hull outline in sea coordinates; the first point is the bow. */
export function hullPoints(pos: Vec, heading: number): Vec[] {
  return HULL.map((p) => add(pos, rotate(p, heading)));
}

export function turretEnd(pos: Vec, turret: number): Vec {
  return add(pos, scale(fromAngle(turret), TURRET_LENGTH));
}

export interface AimGuide {
  end: Vec;
  crosshair: Vec;
  coneLeft: Vec;
  coneRight: Vec;
}

/** The own-ship aiming guide: a line to shot range, a cone either side, and a crosshair at the end. */
export function aimGuide(pos: Vec, turret: number): AimGuide {
  const range = TUNING.gun.shotRange;
  const end = add(pos, scale(fromAngle(turret), range));
  return {
    end,
    crosshair: end,
    coneLeft: add(pos, scale(fromAngle(turret - AIM_CONE_HALF_ANGLE), range)),
    coneRight: add(pos, scale(fromAngle(turret + AIM_CONE_HALF_ANGLE), range)),
  };
}

/** Splits a line into dash segments. */
export function dashes(from: Vec, to: Vec, dash: number, gap: number): [Vec, Vec][] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return [];
  const dir = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const segments: [Vec, Vec][] = [];
  for (let d = 0; d < length; d += dash + gap) {
    segments.push([add(from, scale(dir, d)), add(from, scale(dir, Math.min(d + dash, length)))]);
  }
  return segments;
}
