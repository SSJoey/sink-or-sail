import { TUNING, add, fromAngle, scale, type Vec } from "@sink-or-sail/shared";

/** A point along a cubic (or, with c2 = null, quadratic) curve from a to b. */
function curve(a: Vec, c1: Vec, c2: Vec | null, b: Vec, t: number): Vec {
  const u = 1 - t;
  if (!c2) return { x: u * u * a.x + 2 * u * t * c1.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c1.y + t * t * b.y };
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/** The mock-up's units (bow at 24) to sea units (bow at 28, inside the collision circle). */
const fromMock = (p: Vec): Vec => ({ x: (p.x * 28) / 24, y: (p.y * 28) / 24 });
const steps = (n: number) => Array.from({ length: n }, (_, k) => k / n);
const mirror = (p: Vec): Vec => ({ x: p.x, y: -p.y });

/**
 * Stage 4 slice 4: the sea-chart hull (from the look-options mock-up): a rounded hull with a pointed bow along +x,
 * "M24 0 C 16 -10, -6 -11, -19 -8 Q -22 0 -19 8" and its mirror image back to the bow; inside the collision circle.
 */
const HULL: readonly Vec[] = (() => {
  const side = steps(10).map((t) => curve({ x: 24, y: 0 }, { x: 16, y: -10 }, { x: -6, y: -11 }, { x: -19, y: -8 }, t));
  const stern = steps(6).map((t) => curve({ x: -19, y: -8 }, { x: -22, y: 0 }, null, { x: -19, y: 8 }, t));
  const otherSide = [{ x: -19, y: 8 }, ...side.slice(1).map(mirror).reverse()];
  return [...side, ...stern, ...otherSide].map(fromMock);
})();

/** The deck's three cream planking strokes, in the hull's own frame (mock-up: one across the stern, two bowed). */
const DECK: readonly (readonly Vec[])[] = [
  [{ x: -15, y: -4 }, { x: -15, y: 4 }],
  steps(6).concat(1).map((t) => curve({ x: 11, y: -6 }, { x: 16, y: 0 }, null, { x: 11, y: 6 }, t)),
  steps(6).concat(1).map((t) => curve({ x: -8, y: -7 }, { x: -3, y: 0 }, null, { x: -8, y: 7 }, t)),
].map((line) => line.map(fromMock));

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

/** Stage 4 slice 4: the deck's planking strokes in sea coordinates. */
export function deckLines(pos: Vec, heading: number): Vec[][] {
  return DECK.map((line) => line.map((p) => add(pos, rotate(p, heading))));
}

/** Stage 4 slice 4: two smaller, fainter dots trailing a shot (behind it, along the way it flies). */
export function shotTrail(shot: Vec & { angle: number }): { pos: Vec; radius: number; alpha: number }[] {
  const back = fromAngle(shot.angle + Math.PI);
  const r = TUNING.client.shotRadius;
  return [
    { pos: add(shot, scale(back, 7)), radius: r * 0.75, alpha: 0.55 },
    { pos: add(shot, scale(back, 14)), radius: r * 0.5, alpha: 0.3 },
  ];
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
