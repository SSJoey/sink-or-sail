import { SHIP_TYPES, TUNING, add, fromAngle, scale, type ShipType, type Vec } from "@sink-or-sail/shared";

/** A point along a cubic (or, with c2 = null, quadratic) curve from a to b. */
function curve(a: Vec, c1: Vec, c2: Vec | null, b: Vec, t: number): Vec {
  const u = 1 - t;
  if (!c2) return { x: u * u * a.x + 2 * u * t * c1.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c1.y + t * t * b.y };
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/** The mock-up's units (bow at 24) to sea units: the bow at the ship type's radius, inside its collision circle. */
const fromMock = (p: Vec, radius: number): Vec => ({ x: (p.x * radius) / 24, y: (p.y * radius) / 24 });
const steps = (n: number) => Array.from({ length: n }, (_, k) => k / n);
const mirror = (p: Vec): Vec => ({ x: p.x, y: -p.y });

/**
 * A hull in mock-up units: from the bow at (24, 0), one side as a cubic curve to the stern corner, round the stern
 * as a quadratic curve, and the mirror image back to the bow.
 */
function hullShape(c1: Vec, c2: Vec, corner: Vec, sternX: number): Vec[] {
  const side = steps(10).map((t) => curve({ x: 24, y: 0 }, c1, c2, corner, t));
  const stern = steps(6).map((t) => curve(corner, { x: sternX, y: 0 }, null, mirror(corner), t));
  const otherSide = [mirror(corner), ...side.slice(1).map(mirror).reverse()];
  return [...side, ...stern, ...otherSide];
}

/** A bowed plank across the deck, from (x, -half) through (x + bow, 0) to (x, half). */
const plank = (x: number, half: number, bow: number): Vec[] =>
  steps(6).concat(1).map((t) => curve({ x, y: -half }, { x: x + bow, y: 0 }, null, { x, y: half }, t));

interface HullLook {
  hull: Vec[];
  deck: Vec[][];
  /** Barrel length, in sea units. */
  turret: number;
}

/**
 * Stage 4 slice 4: the sea-chart hull (from the look-options mock-up): a rounded hull with a pointed bow along +x,
 * "M24 0 C 16 -10, -6 -11, -19 -8 Q -22 0 -19 8" and its mirror image back to the bow, with three cream planks.
 * Stage 5: a hull for each ship type, each at its own size: a slim, sharp Cutter; a broad, blunt Ironclad with
 * armour plates; a short, wide Gunboat; a long, narrow Long gun with a long barrel.
 */
const LOOKS: Record<ShipType, HullLook> = {
  frigate: {
    hull: hullShape({ x: 16, y: -10 }, { x: -6, y: -11 }, { x: -19, y: -8 }, -22),
    deck: [[{ x: -15, y: -4 }, { x: -15, y: 4 }], plank(11, 6, 5), plank(-8, 7, 5)],
    turret: 18,
  },
  cutter: {
    hull: hullShape({ x: 12, y: -6 }, { x: -8, y: -7 }, { x: -20, y: -5 }, -22),
    deck: [[{ x: -16, y: -2.5 }, { x: -16, y: 2.5 }], plank(9, 4, 4)],
    turret: 16,
  },
  ironclad: {
    hull: hullShape({ x: 21, y: -11 }, { x: -2, y: -13 }, { x: -18, y: -12 }, -21),
    deck: [
      [{ x: 12, y: -6 }, { x: 12, y: 6 }],
      [{ x: 4, y: -8 }, { x: 4, y: 8 }],
      [{ x: -4, y: -8 }, { x: -4, y: 8 }],
      [{ x: -12, y: -8 }, { x: -12, y: 8 }],
    ],
    turret: 20,
  },
  gunboat: {
    hull: hullShape({ x: 19, y: -12 }, { x: 0, y: -13 }, { x: -14, y: -10 }, -18),
    deck: [[{ x: -11, y: -5 }, { x: -11, y: 5 }], plank(9, 7, 5)],
    turret: 18,
  },
  longGun: {
    hull: hullShape({ x: 12, y: -7 }, { x: -10, y: -8 }, { x: -21, y: -6 }, -23),
    deck: [[{ x: -17, y: -3 }, { x: -17, y: 3 }], [{ x: -8, y: 0 }, { x: 14, y: 0 }], plank(-2, 5, 3)],
    turret: 30,
  },
};

/** Each type's hull and deck in sea units, in the hull's own frame. */
const SHAPES = Object.fromEntries(
  SHIP_TYPES.map((type) => {
    const { radius } = TUNING.shipTypes[type];
    const look = LOOKS[type];
    return [type, { hull: look.hull.map((p) => fromMock(p, radius)), deck: look.deck.map((line) => line.map((p) => fromMock(p, radius))), turret: look.turret }];
  }),
) as Record<ShipType, HullLook>;

/** Half the width of the aiming cone: 10° in total. */
export const AIM_CONE_HALF_ANGLE = (5 * Math.PI) / 180;

const rotate = (p: Vec, angle: number): Vec => ({
  x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
  y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
});

/** Hull outline in sea coordinates, for the ship's type (Stage 5); the first point is the bow. */
export function hullPoints(pos: Vec, heading: number, type: ShipType = "frigate"): Vec[] {
  return SHAPES[type].hull.map((p) => add(pos, rotate(p, heading)));
}

/** Stage 4 slice 4: the deck's planking strokes in sea coordinates (Stage 5: the type's own). */
export function deckLines(pos: Vec, heading: number, type: ShipType = "frigate"): Vec[][] {
  return SHAPES[type].deck.map((line) => line.map((p) => add(pos, rotate(p, heading))));
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

/** The barrel's end (Stage 5: the type's own barrel length). */
export function turretEnd(pos: Vec, turret: number, type: ShipType = "frigate"): Vec {
  return add(pos, scale(fromAngle(turret), SHAPES[type].turret));
}

export interface AimGuide {
  end: Vec;
  crosshair: Vec;
  coneLeft: Vec;
  coneRight: Vec;
}

/** The own-ship aiming guide: a line to the gun's range (Stage 5: the type's own), a cone either side, and a crosshair at the end. */
export function aimGuide(pos: Vec, turret: number, range: number = TUNING.gun.shotRange): AimGuide {
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
