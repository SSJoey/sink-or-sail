export interface Vec {
  x: number;
  y: number;
}

export const ZERO: Vec = { x: 0, y: 0 };

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v: Vec, k: number): Vec => ({ x: v.x * k, y: v.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const length = (v: Vec): number => Math.hypot(v.x, v.y);
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalise(v: Vec): Vec {
  const len = length(v);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

export function clampLength(v: Vec, max: number): Vec {
  const len = length(v);
  return len > max ? scale(v, max / len) : v;
}

/** Angle of a vector. 0 = east; positive = clockwise on screen, because y points down. */
export const angleOf = (v: Vec): number => Math.atan2(v.y, v.x);
export const fromAngle = (angle: number): Vec => ({ x: Math.cos(angle), y: Math.sin(angle) });

/** Wraps an angle into (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** Turns `from` toward `to` the short way round, by at most `maxStep`. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const diff = wrapAngle(to - from);
  if (Math.abs(diff) <= maxStep) return from + diff;
  return from + Math.sign(diff) * maxStep;
}
